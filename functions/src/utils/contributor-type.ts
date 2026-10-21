/**
 * El tipo de contribuyente del emisor, para el RIDE («Tipo de contribuyente:
 * Sociedad», pedido del usuario el 2026-10-21).
 *
 * `companies/{cid}.sri.contributorType` llega con valores de varias épocas:
 * el alta desde Conecta manda `'natural' | 'juridica'` y la web de FacturaEc
 * guarda `'PERSONA_NATURAL' | 'SOCIEDAD'` (las 5 empresas de producción tienen
 * de los dos). Lo que no se reconoce devuelve '' y el RIDE no imprime la fila.
 */
export function contributorTypeLabel(raw: unknown): string {
  const v = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (['SOCIEDAD', 'JURIDICA', 'JURÍDICA', 'PERSONA_JURIDICA', 'PERSONA_JURÍDICA'].includes(v)) return 'Sociedad';
  if (['NATURAL', 'PERSONA_NATURAL'].includes(v)) return 'Persona natural';
  return '';
}
