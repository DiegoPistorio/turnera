// Datos del negocio. Cambiando esto (y los colores en globals.css) se adapta la app a otro cliente.
export const NEGOCIO = {
  nombre: "The King Black Barber",
  logo: "/logo.png",
  zonaHoraria: "America/Argentina/Buenos_Aires",
  diasVisibles: 14, // cuántos días hacia adelante se puede reservar
  // Horario de atención fijo. Cada peluquero elige qué días trabaja dentro de este horario.
  horario: { apertura: "10:00", cierre: "20:00" },
  diasAtencion: [1, 2, 3, 4, 5, 6], // 0 = domingo ... 6 = sábado
  // Seña por Mercado Pago al reservar desde la web (los turnos cargados en el panel no la piden).
  // Monto y plazo de cancelación son provisorios: los define la barbería.
  sena: {
    monto: 1000,
    minutosParaPagar: 15, // si no se paga en este plazo, el turno vence y libera el horario
    horasMinimasCancelacion: 2, // el cliente puede cancelar hasta esta cantidad de horas antes (la seña no se devuelve)
  },
};
