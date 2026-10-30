import { buildDefaultRouting } from './routing';
import { migrateFlatGridToMeasures } from '../state/sequencer-measures';

const renameTrackId = (id) =>
  typeof id === 'string' ? id.replace(/^track-(\d+)/, 'row-$1') : id;

/** Rewrite pre-row-rename HMR / persisted shapes so sequencer audio keeps working. */
export const migrateState = (state) => {
  if (!state) return state;

  let next = state;
  const seq = state.sequencer;
  if (seq) {
    const patch = {};
    if (seq.rows == null && seq.tracks != null) patch.rows = seq.tracks;
    if (seq.selectedRow === undefined && seq.selectedTrack !== undefined) {
      patch.selectedRow = seq.selectedTrack;
    }
    if (seq.rowParams == null && seq.trackParams != null) patch.rowParams = seq.trackParams;

    if (Object.keys(patch).length) {
      const { tracks: _tracks, selectedTrack: _st, trackParams: _tp, ...rest } = seq;
      next = { ...next, sequencer: { ...rest, ...patch } };
    }

    const migrated = migrateFlatGridToMeasures(next.sequencer, next.transport);
    if (migrated !== next.sequencer) {
      next = { ...next, sequencer: migrated };
    }
  }

  const routing = next.routing;
  const needsRoutingMigrate = routing?.nodes?.some(
    (n) => typeof n.id === 'string' && /^track-\d+/.test(n.id),
  );
  if (needsRoutingMigrate) {
    const rows = next.sequencer?.rows ?? 4;
    const loopSlots =
      next.tracks?.find((t) => t?.loop?.slots)?.loop?.slots?.length ?? 4;
    next = {
      ...next,
      // Rebuild — old graph ids won't match getRowInput(`row-*-in`).
      routing: buildDefaultRouting(rows, loopSlots),
    };
  } else if (routing?.edges?.some((e) => e.gainParam?.[1] === 'trackParams')) {
    next = {
      ...next,
      routing: {
        ...routing,
        edges: routing.edges.map((e) => ({
          ...e,
          gainParam:
            e.gainParam?.[0] === 'sequencer' && e.gainParam?.[1] === 'trackParams'
              ? ['sequencer', 'rowParams', ...e.gainParam.slice(2)]
              : e.gainParam,
        })),
      },
    };
  }

  return next;
};
