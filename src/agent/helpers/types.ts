export interface ExternalApiCallTemplate {
  call: 'send_crm';
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body: string;
  variablesMapping: Record<string, string>;
}
