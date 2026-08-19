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
PID="11111111-1111-4111-8111-111111111111"
push(){ curl -s -X POST $API/sync/push -H "authorization: Bearer $1" -H 'content-type: application/json' -d "$2"; }
BODY='{"device_id":"dev-A","changes":[{"entity_type":"patients","entity_id":"'$PID'","op":"upsert","rev":1,"base_rev":0,"payload":{"facility_id":"fac-0062","first_name":"Obinna","last_name":"Eze","date_of_birth":"1990-01-01","sex":"male","phone_primary":"+2348030000000"},"client_ts":"2026-08-19T10:00:00Z"}]}'
R1=$(push "$NURSE_A" "$BODY")
chk "first push applied" "$(echo "$R1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["status"])')" "applied"
REV1=$(echo "$R1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["server_rev"])')
R2=$(push "$NURSE_A" "$BODY")
REV2=$(echo "$R2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["server_rev"])')
chk "replayed push does not bump rev (idempotent)" "$REV2" "$REV1"

echo "== 5. Cross-facility isolation (the Phase 3 guarantee) =="
BAD='{"device_id":"dev-A","changes":[{"entity_type":"patients","entity_id":"22222222-2222-4222-8222-222222222222","op":"upsert","rev":1,"base_rev":0,"payload":{"facility_id":"fac-0060","first_name":"Foreign"},"client_ts":"2026-08-19T10:00:00Z"}]}'
ST=$(push "$NURSE_A" "$BAD" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["status"])')
chk "device cannot write to another facility" "$ST" "rejected"
CODE=$(curl -s "$API/sync/changes?since=0&scope=fac-0060" -H "authorization: Bearer $NURSE_A" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("error",{}).get("code","NONE"))')
chk "device cannot widen its pull scope" "$CODE" "OUT_OF_SCOPE"

echo "== 6. Pull sees own facility's change =="
N=$(curl -s "$API/sync/changes?since=0" -H "authorization: Bearer $NURSE_A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["changes"]))')
chk "facility A pulls its own change" "$N" "1"
N=$(curl -s "$API/sync/changes?since=0" -H "authorization: Bearer $NURSE_B" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["changes"]))')
chk "facility B sees none of facility A's data" "$N" "0"

echo "== 7. Two-device concurrency: workflow state-priority =="
QID="33333333-3333-4333-8333-333333333333"
push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"queueEntries","entity_id":"'$QID'","op":"upsert","rev":1,"base_rev":0,"payload":{"facility_id":"fac-0062","status":"waiting"},"client_ts":"2026-08-19T10:00:00Z"}]}' >/dev/null
push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"queueEntries","entity_id":"'$QID'","op":"upsert","rev":2,"base_rev":1,"payload":{"facility_id":"fac-0062","status":"completed"},"client_ts":"2026-08-19T10:05:00Z"}]}' >/dev/null
# Device B (stale, base_rev=1) tries to set in_progress — must not bounce back
RES=$(push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"queueEntries","entity_id":"'$QID'","op":"upsert","rev":2,"base_rev":1,"payload":{"facility_id":"fac-0062","status":"in_progress"},"client_ts":"2026-08-19T10:06:00Z"}]}')
ST=$(echo "$RES" | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["server_payload"]["status"])')
chk "queue converges forward to completed" "$ST" "completed"

echo "== 8. Identity-critical contradiction escalates =="
push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"patients","entity_id":"'$PID'","op":"upsert","rev":2,"base_rev":1,"payload":{"facility_id":"fac-0062","first_name":"Obinna","date_of_birth":"1990-06-06"},"client_ts":"2026-08-19T11:00:00Z"}]}' >/dev/null
RES=$(push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"patients","entity_id":"'$PID'","op":"upsert","rev":2,"base_rev":1,"payload":{"facility_id":"fac-0062","first_name":"Obinna","date_of_birth":"1992-09-09"},"client_ts":"2026-08-19T11:01:00Z"}]}')
NR=$(echo "$RES" | python3 -c 'import sys,json;r=json.load(sys.stdin)["results"][0];print(r.get("needs_review"))')
chk "contradictory DOB flagged needs_review" "$NR" "True"
ADMIN=$(login admin 5555 fac-0062 dev-A | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
NC=$(curl -s "$API/admin/conflicts" -H "authorization: Bearer $ADMIN" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))')
chk "conflict reached the admin queue (not dropped)" "$NC" "1"

echo "== 9. RBAC on admin queue =="
CODE=$(curl -s "$API/admin/conflicts" -H "authorization: Bearer $NURSE_A" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("error",{}).get("code","NONE"))')
chk "nurse cannot read the admin conflict queue" "$CODE" "FORBIDDEN"

echo "== 10. Config is hub-authoritative =="
ST=$(push "$NURSE_A" '{"device_id":"dev-A","changes":[{"entity_type":"facilities","entity_id":"44444444-4444-4444-8444-444444444444","op":"upsert","rev":1,"base_rev":0,"payload":{"facility_id":"fac-0062","name":"Renamed"},"client_ts":"2026-08-19T10:00:00Z"}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["results"][0]["status"])')
chk "client cannot push config" "$ST" "rejected"

echo "== 11. Baseline snapshot is scoped =="
NB=$(curl -s "$API/sync/baseline" -H "authorization: Bearer $NURSE_B" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["changes"]))')
chk "facility B baseline excludes facility A rows" "$NB" "0"
NA=$(curl -s "$API/sync/baseline" -H "authorization: Bearer $NURSE_A" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["changes"]))')
chk "facility A baseline returns its rows" "$NA" "2"

echo
echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
