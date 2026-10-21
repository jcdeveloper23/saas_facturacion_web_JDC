import { parseAllMessages } from '../invoices/send-to-sri';

describe('parseAllMessages', () => {
  it('omite los campos que el SRI no manda (Firestore no acepta undefined)', () => {
    const soap = `<autorizacion><estado>NO AUTORIZADO</estado><mensajes>
      <mensaje><identificador>69</identificador><mensaje>ERROR EN LA IDENTIFICACION DEL RECEPTOR</mensaje><tipo>ERROR</tipo></mensaje>
    </mensajes></autorizacion>`;
    const [msg] = parseAllMessages(soap);
    expect(msg).toEqual({ identificador: '69', mensaje: 'ERROR EN LA IDENTIFICACION DEL RECEPTOR', tipo: 'ERROR' });
    expect(Object.values(msg)).not.toContain(undefined);
    expect('informacionAdicional' in msg).toBe(false);
  });

  it('conserva informacionAdicional cuando viene', () => {
    const soap = `<mensaje><identificador>43</identificador><mensaje>CLAVE ACCESO REGISTRADA</mensaje>
      <informacionAdicional>La clave ya fue registrada</informacionAdicional><tipo>ERROR</tipo></mensaje>`;
    expect(parseAllMessages(soap)).toEqual([
      { identificador: '43', mensaje: 'CLAVE ACCESO REGISTRADA', informacionAdicional: 'La clave ya fue registrada', tipo: 'ERROR' },
    ]);
  });

  it('un mensaje con solo el texto no lleva claves vacías', () => {
    const [msg] = parseAllMessages('<mensaje><mensaje>ADVERTENCIA</mensaje></mensaje>');
    expect(msg).toEqual({ mensaje: 'ADVERTENCIA' });
  });
});
