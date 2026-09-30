// Arma el link de WhatsApp para un celular argentino guardado como "1123456789"
export function linkWhatsApp(telefono: string, mensaje?: string) {
  const digitos = telefono.replace(/\D/g, "");
  const numero = digitos.startsWith("54") ? digitos : `549${digitos}`;
  return `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}`;
}
