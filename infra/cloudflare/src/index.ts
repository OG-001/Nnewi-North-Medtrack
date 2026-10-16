/**
 * Cloudflare Worker entrypoint for the PHC-Track sync hub.
 *
 * NOT YET DEPLOYED OR EXERCISED. See infra/cloudflare/wrangler.jsonc.
 *
 * The Worker does no application work. It exists because a Cloudflare Container
 * is reached through a Durable Object, so something has to hold the binding and
 * forward the request. All routing, authentication and scope enforcement stay in
 * the NestJS hub, which is the only place they are tested.
 */
import { Container, getContainer } from "@cloudflare/containers";

interface Env {
  PHC_HUB: DurableObjectNamespace<PhcHub>;
}

export class PhcHub extends Container {
  /** The port infra/Dockerfile.api exposes and the hub listens on. */
  defaultPort = 3000;

  /**
   * Idle before the instance is stopped.
   *
   * Clinics sync in bursts, so a short value would mean a cold start for the
   * first nurse of every quiet period, and a cold start here includes
   * establishing the database connection pool. Fifteen minutes keeps the
   * instance warm across a normal clinic session while still letting it sleep
   * overnight, which is what makes the usage-based pricing worth having.
   */
  sleepAfter = "15m";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    /**
     * A single named instance, deliberately.
     *
     * Passing a constant name routes every request to one container rather than
     * one per session. Three reasons:
     *
     *   1. One connection pool against Postgres instead of one per session,
     *      which is what would actually exhaust the database.
     *   2. Every user is in one LGA, so there is no geography to spread across.
     *      Spreading would only move instances away from the database.
     *   3. The hub keeps no in-memory state worth isolating. Sync ordering is
     *      decided by server_seq in Postgres, not by which instance answered.
     *
     * If one instance ever becomes the bottleneck, shard on facility_id rather
     * than on session, so a facility's pushes stay serialised through one
     * instance and the conflict rules keep seeing a consistent view.
     */
    return getContainer(env.PHC_HUB, "hub").fetch(request);
  },
};
