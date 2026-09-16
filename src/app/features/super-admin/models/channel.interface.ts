/**
 * Canal: un producto que vende FacturaEc bajo su marca (Conectate, Mi Buseta).
 * No es un tenant — los tenants son las empresas, que llevan `channelId`.
 * Ver docs/PLAN_CANALES_MULTIMARCA.md.
 *
 * Doc: channels/{channelId}. El id es el mismo que viaja en el claim.
 */
export type ChannelStatus = 'active' | 'suspended';

export interface ChannelAdmin {
  email: string;
  grantedAt?: any;
  grantedBy?: string;
}

export interface Channel {
  id: string;
  name: string;
  status: ChannelStatus;
  contactEmail?: string;
  /** Lo escribe el callable manageChannelAdmin; la pantalla solo lo lee. */
  admins?: Record<string, ChannelAdmin>;
  createdAt?: any;
  updatedAt?: any;
}

export interface ChannelFormData {
  name: string;
  contactEmail: string;
}
