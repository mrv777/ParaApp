import { colors, theme, tempThresholds } from '@constants/index';

describe('Constants', () => {
  describe('colors', () => {
    it('has the correct background color', () => {
      expect(colors.background).toBe('#0a0a0a');
    });

    it('has the correct text color', () => {
      expect(colors.text).toBe('#ededed');
    });

    it('has warning and danger colors', () => {
      expect(colors.warning).toBe('#facc15');
      expect(colors.danger).toBe('#ef4444');
    });
  });

  describe('tempThresholds', () => {
    it('has correct caution threshold (68°C)', () => {
      expect(tempThresholds.caution).toBe(68);
    });

    it('has correct danger threshold (70°C)', () => {
      expect(tempThresholds.danger).toBe(70);
    });
  });

  describe('theme', () => {
    it('exports a complete theme object', () => {
      expect(theme).toBeDefined();
      expect(theme.colors).toBeDefined();
      expect(theme.spacing).toBeDefined();
      expect(theme.typography).toBeDefined();
    });
  });
});
