import { GenericPageView } from "@/components/sites/kanban/GenericPageView";
import { Inbox, PhoneCall, MessageSquare } from "lucide-react";

export default function InboxPage() {
  const solicitudes = [
    {
      cliente: "Sallustro",
      local: "Hering",
      solicitante: "Marcelo Riquelme (Jefe de Tienda)",
      origen: "WhatsApp",
      detalle: "Reportan cortes intermitentes en la red de las terminales de cobro del área de ventas.",
      fecha: "Hoy, 10:30",
    },
    {
      cliente: "Sallustro",
      local: "Aldo - Paseo La Galería",
      solicitante: "Encargada de Local",
      origen: "Llamada telefónica",
      detalle: "La cámara domo del sector caja 2 no da imagen en el monitor de seguridad.",
      fecha: "Hoy, 09:15",
    },
    {
      cliente: "Sallustro",
      local: "Casa Central",
      solicitante: "Recepción",
      origen: "WhatsApp",
      detalle: "Se solicita mantenimiento del proyector y cableado HDMI en la sala de directorio.",
      fecha: "Ayer, 16:40",
    },
  ];

  return (
    <GenericPageView
      title="Bandeja de Solicitudes de Asistencia"
      badge="3 pendientes"
      icon={Inbox}
      description="Solicitudes ficticias para mostrar la interfaz. No se crean órdenes en esta demo."
    >
      <div className="space-y-4">
        {solicitudes.map((s, idx) => (
          <div key={idx} className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">{s.cliente}</span>
                <span className="text-muted-foreground text-xs">• Local: <strong className="text-foreground">{s.local}</strong></span>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {s.origen === "WhatsApp" ? <MessageSquare className="size-3" /> : <PhoneCall className="size-3" />}
                  {s.origen}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{s.fecha}</span>
            </div>

            <p className="text-xs text-foreground leading-relaxed">{s.detalle}</p>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-muted-foreground">Solicitado por: {s.solicitante}</span>
              <span className="text-xs text-muted-foreground">Solo lectura</span>
            </div>
          </div>
        ))}
      </div>
    </GenericPageView>
  );
}
