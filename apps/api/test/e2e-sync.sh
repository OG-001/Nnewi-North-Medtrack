#!/usr/bin/env bash
# Protocol-level sync tests (offline-sync-design §10) run against a live hub.
#
#   1. start postgres and run `pnpm --filter @phc/api prisma:migrate && pnpm --filter @phc/api seed`
#   2. start the hub on PORT=3100
#   3. bash apps/api/test/e2e-sync.sh
#
# Covers: scoped auth, device enrolment, idempotent replay, cross-facility
# isolation (push and pull), state-priority merge, identity-critical escalation
# into the admin queue, RBAC, hub-authoritative config, and scoped baseline.
set -u
API=http://localhost:3100/api/v1
pass=0; fail=0
chk(){ if [ "$2" = "$3" ]; then echo "  PASS  $1"; pass=$((pass+1)); else echo "  FAIL  $1 (expected '$3', got '$2')"; fail=$((fail+1)); fi; }

login(){ curl -s -X POST $API/auth/login -H 'content-type: application/json' \
  -d "{\"username\":\"$1\",\"pin\":\"$2\",\"facility_id\":\"$3\",\"device_id\":\"$4\"}"; }

echo "== 1. Scoped authentication =="
NURSE_A=$(login nurse 2222 fac-0062 dev-A | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))')
[ -n "$NURSE_A" ] && chk "nurse signs in at own facility 0062" "ok" "ok" || chk "nurse signs in at own facility" "no-token" "ok"
CODE=$(login nurse 2222 fac-0001 dev-X | python3 -c 'import sys,json;print(json.load(sys.stdin).get("error",{}).get("code","NONE"))')
chk "nurse rejected at an unprovisioned facility" "$CODE" "UNAUTHENTICATED"
CODE=$(login nurse 9999 fac-0062 dev-X | python3 -c 'import sys,json;print(json.load(sys.stdin).get("error",{}).get("code","NONE"))')
chk "wrong PIN rejected" "$CODE" "UNAUTHENTICATED"
NURSE_B=$(login nurse 2222 fac-0060 dev-B 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))')
# facility 0060 has its own nurse account
NURSE_B=$(login nurse 2222 fac-0060 dev-B | python3 -c 'import sys,json;print(json.load(sys.stdin).get("accessToken",""))')

echo "== 2. Unauthenticated access =="
CODE=$(curl -s $API/sync/changes?since=0 | python3 -c 'import sys,json;print(json.load(sys.stdin).get("error",{}).get("code","NONE"))')
chk "sync requires auth" "$CODE" "UNAUTHENTICATED"

echo "== 3. Device enrolment =="
ENR=$(curl -s -X POST $API/sync/enroll -H "authorization: Bearer $NURSE_A" -H 'content-type: application/json' -d '{"device_id":"dev-A","label":"Ward 2 tablet"}')
SCOPE=$(echo "$ENR" | python3 -c 'import sys,json;print(",".join(json.load(sys.stdin)["scope"]))')
chk "device scope is its own facility only" "$SCOPE" "fac-0062"

echo "== 4. Push a patient, then replay it (idempotency) =="
# Fresh ids per run: re-pushing the same id is (correctly) a no-op, so fixed
# ids would make every count-delta assertion fail on the second run.
RUN=$(python3 -c 'import uuid; print(uuid.uuid4().hex[:12])')
PID="${RUN}-0000-4000-8000-000000000001"
push(){ curl -s -X POST $API/sync/push -H "authorization: Bearer $1" -H 'content-type: application/json' -d "$2"; }

# The hub keeps a long-lived ledger shared with the vitest suite, and a page is
# capped, so totals are meaningless here. An empty push returns the current head
# watermark; everything below is then asserted against changes after that point.
HEAD0=$(push "$NURSE_A" '{"device_id":"dev-A","changes":[]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["server_seq"])')

BODY='{"device_id":"dev-A","changes":[{"entity_type":"patient","entity_id":"'$PID'","op":"upsert","rev":1,"base_rev":0,"payload":{"facility_id":"fac-0062","first_name":"Obinna","last_name":"Eze","date_of_birth":"1990-01-01","sex":"male","phone_primary":"+2348030000000"},"client_ts":"2026-08-19T10:00:00Z"}]}'
R1=$(push "$NURSE_A" "$BODY")
chk "first push applied" "$(echo "$R1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["status"])')" "applied"
REV1=$(echo "$R1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["server_rev"])')
R2=$(push "$NURSE_A" "$BODY")
REV2=$(echo "$R2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["server_rev"])')
chk "replayed push does not bump rev (idempotent)" "$REV2" "$REV1"

echo "== 5. Cross-facility isolation (the Phase 3 guarantee) =="
BAD='{"device_id":"dev-A","changes":[{"entity_type":"patient","entity_id":"'"${RUN}"-0000-4000-8000-000000000002'","op":"upsert","rev":1,"base_rev":0,"payload":{"facility_id":"fac-0060","first_name":"Foreign"},"client_ts":"2026-08-19T10:00:00Z"}]}'
ST=$(push "$NURSE_A" "$BAD" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["status"])')
chk "device cannot write to another facility" "$ST" "rejected"
CODE=$(curl -s "$API/sync/changes?since=0&scope=fac-0060" -H "authorization: Bearer $NURSE_A" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("error",{}).get("code","NONE"))')
chk "device cannot widen its pull scope" "$CODE" "OUT_OF_SCOPE"

echo "== 6. Pull sees own facility's change =="
N=$(curl -s "$API/sync/changes?since=$HEAD0&limit=500" -H "authorization: Bearer $NURSE_A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["changes"]))')
chk "facility A pulls its own change" "$N" "1"
N=$(curl -s "$API/sync/changes?since=$HEAD0&limit=500" -H "authorization: Bearer $NURSE_B" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["changes"]))')
chk "facility B sees none of facility A's data" "$N" "0"

echo "== 7. Two-device concurrency: workflow state-priority =="
QID="${RUN}-0000-4000-8000-000000000003"
push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"queue_entry","entity_id":"'$QID'","op":"upsert","rev":1,"base_rev":0,"payload":{"facility_id":"fac-0062","status":"waiting"},"client_ts":"2026-08-19T10:00:00Z"}]}' >/dev/null
push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"queue_entry","entity_id":"'$QID'","op":"upsert","rev":2,"base_rev":1,"payload":{"facility_id":"fac-0062","status":"completed"},"client_ts":"2026-08-19T10:05:00Z"}]}' >/dev/null
# Device B (stale, base_rev=1) tries to set in_progress — must not bounce back
RES=$(push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"queue_entry","entity_id":"'$QID'","op":"upsert","rev":2,"base_rev":1,"payload":{"facility_id":"fac-0062","status":"in_progress"},"client_ts":"2026-08-19T10:06:00Z"}]}')
ST=$(echo "$RES" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["server_payload"]["status"])')
chk "queue converges forward to completed" "$ST" "completed"

echo "== 8. Identity-critical contradiction escalates =="
push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"patient","entity_id":"'$PID'","op":"upsert","rev":2,"base_rev":1,"payload":{"facility_id":"fac-0062","first_name":"Obinna","date_of_birth":"1990-06-06"},"client_ts":"2026-08-19T11:00:00Z"}]}' >/dev/null
RES=$(push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"patient","entity_id":"'$PID'","op":"upsert","rev":2,"base_rev":1,"payload":{"facility_id":"fac-0062","first_name":"Obinna","date_of_birth":"1992-09-09"},"client_ts":"2026-08-19T11:01:00Z"}]}')
NR=$(echo "$RES" | python3 -c 'import sys,json;r=json.load(sys.stdin)["results"][0];print(r.get("needs_review"))')
chk "contradictory DOB flagged needs_review" "$NR" "True"
ADMIN=$(login admin 5555 fac-0062 dev-A | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
# Newest first, so this run's escalation is the head of the queue.
NC=$(curl -s "$API/admin/conflicts" -H "authorization: Bearer $ADMIN" | python3 -c "import sys,json;q=json.load(sys.stdin);print(q[0]['entityId'] if q else 'EMPTY')")
chk "conflict reached the admin queue (not dropped)" "$NC" "$PID"

echo "== 9. RBAC on admin queue =="
CODE=$(curl -s "$API/admin/conflicts" -H "authorization: Bearer $NURSE_A" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("error",{}).get("code","NONE"))')
chk "nurse cannot read the admin conflict queue" "$CODE" "FORBIDDEN"

echo "== 10. Config is hub-authoritative =="
ST=$(push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"facility","entity_id":"'"${RUN}"-0000-4000-8000-000000000004'","op":"upsert","rev":1,"base_rev":0,"payload":{"facility_id":"fac-0062","name":"Renamed"},"client_ts":"2026-08-19T10:00:00Z"}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["status"])')
chk "client cannot push config" "$ST" "rejected"

echo "== 11. Baseline snapshot is scoped =="
# Not "B is empty": B has its own rows. The property is that none of THIS run's
# facility-A rows appear in B's baseline.
NB=$(curl -s "$API/sync/baseline?limit=500" -H "authorization: Bearer $NURSE_B" \
  | PID="$PID" QID="$QID" python3 -c 'import sys,json,os
ids={c["entity_id"] for c in json.load(sys.stdin)["changes"]}
print("leaked" if (os.environ["PID"] in ids or os.environ["QID"] in ids) else "clean")')
chk "facility B baseline excludes facility A rows" "$NB" "clean"
NA=$(curl -s "$API/sync/baseline?limit=500" -H "authorization: Bearer $NURSE_A" | python3 -c 'import sys,json;print("some" if len(json.load(sys.stdin)["changes"]) else "none")')
chk "facility A baseline returns its own rows" "$NA" "some"

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
