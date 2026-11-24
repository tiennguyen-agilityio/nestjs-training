import { ProductUnit } from '@repo/constants';
import { variantNameFrom } from './variant-name.util.js';

describe('variantNameFrom', () => {
  it('"250" G is "250g"', () => {
    expect(variantNameFrom('250', ProductUnit.G)).toBe('250g');
  });

  it('"250.00" G is "250g"', () => {
    expect(variantNameFrom('250.00', ProductUnit.G)).toBe('250g');
  });

  it('"1.50" KG is "1.5kg"', () => {
    expect(variantNameFrom('1.50', ProductUnit.KG)).toBe('1.5kg');
  });

  it('500 ML is "500ml"', () => {
    expect(variantNameFrom(500, ProductUnit.ML)).toBe('500ml');
  });

  it('"1" L is "1l"', () => {
    expect(variantNameFrom('1', ProductUnit.L)).toBe('1l');
  });
});
