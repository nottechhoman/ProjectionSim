import { normalizeFeedRect } from './model';

export { legacyPrimaryReceiver } from './migrate';

type Raw = Record<string, any>;

/** Apply the v2 loader's defaults to a raw v1/v2 project (test reference only). */
export function normalizeLegacy(data: Raw): Raw {
  const sceneObjects = (data.sceneObjects ?? []).map((o: Raw) => {
    if (!o.uvMapping) return o;
    const rect = normalizeFeedRect({ ...o.uvMapping, screenId: o.id });
    return { ...o, uvMapping: { ...rect, enabled: o.uvMapping.enabled === true } };
  });
  const projectors = (data.projectors ?? []).map((p: Raw) => ({
    ...p,
    mediaSource: p.mediaSource ?? 'pattern',
    testPattern: p.testPattern ?? 'checkerboard',
  }));
  return { ...data, sceneObjects, projectors };
}
