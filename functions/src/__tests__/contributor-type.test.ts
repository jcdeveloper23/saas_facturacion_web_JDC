import { contributorTypeLabel } from '../utils/contributor-type';

describe('contributorTypeLabel', () => {
  it('los valores de producción', () => {
    expect(contributorTypeLabel('SOCIEDAD')).toBe('Sociedad');
    expect(contributorTypeLabel('juridica')).toBe('Sociedad');
    expect(contributorTypeLabel('PERSONA_NATURAL')).toBe('Persona natural');
    expect(contributorTypeLabel('natural')).toBe('Persona natural');
  });
  it('lo desconocido o vacío no imprime nada', () => {
    expect(contributorTypeLabel('')).toBe('');
    expect(contributorTypeLabel(undefined)).toBe('');
    expect(contributorTypeLabel('otro')).toBe('');
  });
});
