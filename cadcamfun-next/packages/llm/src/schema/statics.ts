/**
 * Attach static helpers to a Schema value. Effect 4 schemas expose `make` as a
 * prototype getter, so `Object.assign` throws; define own properties instead.
 */
export const withStatics = <S extends object, E extends object>(schema: S, statics: E): S & E => {
  for (const [key, value] of Object.entries(statics)) {
    Object.defineProperty(schema, key, { value, writable: true, enumerable: true, configurable: true })
  }
  return schema as S & E
}
