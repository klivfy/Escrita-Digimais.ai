/** Baixa um texto JSON como arquivo. A URL temporária é liberada depois, para não cancelar o download em navegadores que o iniciam de forma assíncrona. */
export function downloadJson(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
