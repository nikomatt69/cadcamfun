/**
 * CAD Factories Index - Export centralizzato di tutte le factory
 * Sistema modulare che sostituisce createThreeObject() monster function
 */

import { AdvancedPrimitivesFactory } from './AdvancedPrimitivesFactory';
import { AssemblyFactory } from './AssemblyFactory';
import { BasicPrimitivesFactory } from './BasicPrimitivesFactory';
import CADFactoryRegistry from './CADFactoryRegistry';
import { ComplexShapesFactory } from './ComplexShapesFactory';
import { DrawingElementsFactory } from './DrawingElementsFactory';
import { Elements2DFactory } from './Elements2DFactory';
import { MeasurementElementsFactory } from './MeasurementElementsFactory';

// Export main registry
export { CADFactoryRegistry, createThreeObject } from './CADFactoryRegistry';
export type { CADFactory, FactoryStats } from './CADFactoryRegistry';

// Export individual factories
export { BasicPrimitivesFactory } from './BasicPrimitivesFactory';
export type { BasicPrimitiveElement } from './BasicPrimitivesFactory';

export { AdvancedPrimitivesFactory } from './AdvancedPrimitivesFactory';
export type { AdvancedPrimitiveElement } from './AdvancedPrimitivesFactory';

export { Elements2DFactory } from './Elements2DFactory';
export type { Element2D } from './Elements2DFactory';

export { MeasurementElementsFactory } from './MeasurementElementsFactory';
export type { MeasurementElement } from './MeasurementElementsFactory';

export { DrawingElementsFactory } from './DrawingElementsFactory';
export type { DrawingElement } from './DrawingElementsFactory';

export { ComplexShapesFactory } from './ComplexShapesFactory';
export type { ComplexShapeElement } from './ComplexShapesFactory';

export { AssemblyFactory } from './AssemblyFactory';
export type { AssemblyElement } from './AssemblyFactory';

// Utility functions
export const getAllSupportedElementTypes = () => {
  return [
    ...BasicPrimitivesFactory.getSupportedTypes(),
    ...AdvancedPrimitivesFactory.getSupportedTypes(),
    ...Elements2DFactory.getSupportedTypes(),
    ...MeasurementElementsFactory.getSupportedTypes(),
    ...DrawingElementsFactory.getSupportedTypes(),
    ...ComplexShapesFactory.getSupportedTypes(),
    ...AssemblyFactory.getSupportedTypes()
  ].sort();
};

export const getFactoryForType = (elementType: string) => {
  if (BasicPrimitivesFactory.supports(elementType)) return BasicPrimitivesFactory;
  if (AdvancedPrimitivesFactory.supports(elementType)) return AdvancedPrimitivesFactory;
  if (Elements2DFactory.supports(elementType)) return Elements2DFactory;
  if (MeasurementElementsFactory.supports(elementType)) return MeasurementElementsFactory;
  if (DrawingElementsFactory.supports(elementType)) return DrawingElementsFactory;
  if (ComplexShapesFactory.supports(elementType)) return ComplexShapesFactory;
  if (AssemblyFactory.supports(elementType)) return AssemblyFactory;
  return null;
};

// Factory statistics
export const getFactoryStats = () => {
  return {
    basicPrimitives: BasicPrimitivesFactory.getSupportedTypes().length,
    advancedPrimitives: AdvancedPrimitivesFactory.getSupportedTypes().length,
    elements2D: Elements2DFactory.getSupportedTypes().length,
    measurements: MeasurementElementsFactory.getSupportedTypes().length,
    drawings: DrawingElementsFactory.getSupportedTypes().length,
    complexShapes: ComplexShapesFactory.getSupportedTypes().length,
    assembly: AssemblyFactory.getSupportedTypes().length,
    total: getAllSupportedElementTypes().length
  };
};

// Debug info for development
export const getFactoriesDebugInfo = () => {
  const stats = getFactoryStats();
  const allTypes = getAllSupportedElementTypes();
  
  return {
    factoryStats: stats,
    allSupportedTypes: allTypes,
    typesByCategory: {
      basicPrimitives: BasicPrimitivesFactory.getSupportedTypes(),
      advancedPrimitives: AdvancedPrimitivesFactory.getSupportedTypes(),
      elements2D: Elements2DFactory.getSupportedTypes(),
      measurements: MeasurementElementsFactory.getSupportedTypes(),
      drawings: DrawingElementsFactory.getSupportedTypes(),
      complexShapes: ComplexShapesFactory.getSupportedTypes(),
      assembly: AssemblyFactory.getSupportedTypes()
    },
    registryInfo: CADFactoryRegistry.getDebugInfo()
  };
};
