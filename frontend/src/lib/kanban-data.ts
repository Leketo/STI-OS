export type Priority = "urgent" | "high" | "medium" | "low";

export type TaskType =
  | "Cámaras"
  | "Cableado"
  | "Sonido"
  | "Redes"
  | "Mantenimiento"
  | "Hardware";

export type TaskTag =
  | "Sallustro"
  | "Casa Central"
  | "Hering"
  | "Paseo La Galería"
  | "Depósito";

export interface Assignee {
  name: string;
  avatarUrl: string;
}

export interface Task {
  id: string;
  key: string;
  title: string;
  priority: Priority;
  leftBarColor: string;
  type: TaskType;
  typeColor: string;
  tag?: TaskTag;
  tagColor?: string;
  hasExtraAssignee?: boolean;
  subtasks?: {
    completed: number;
    total: number;
  };
  isOverdue?: boolean;
  assignees: Assignee[];
}

export interface Column {
  id: string;
  title: string;
  dotColor: string;
  wipLimit?: number;
  tasks: Task[];
}

export interface Project {
  id: string;
  name: string;
  icon: string;
  client?: string;
  description?: string;
  issueCount?: number;
}

// Demo records use a location tag; this explicit map prevents tasks from leaking
// into an unrelated project when the route changes.
export const PROJECT_TASK_TAGS: Record<string, TaskTag | null> = {
  "proj-1": "Casa Central",
  "project-hering": "Hering",
  "project-aldo-galeria": "Paseo La Galería",
  "project-fit-for-life": null,
  "project-deposito-central": "Depósito",
  "project-shopping-mariscal": null,
};

export const CLIENT_VISIBLE_COLUMN_IDS = ["Backlog", "Todo", "In Progress", "In Review"];

export const PROJECTS: Project[] = [
  {
    id: "proj-1",
    name: "Casa Central",
    icon: "🏢",
    client: "Sallustro",
    description: "Instalaciones y mantenimiento de la sede principal",
    issueCount: 24,
  },
  {
    id: "project-hering",
    name: "Hering",
    icon: "🛍️",
    client: "Sallustro",
    description: "Servicios técnicos del local comercial",
    issueCount: 8,
  },
  {
    id: "project-aldo-galeria",
    name: "Aldo - Paseo La Galería",
    icon: "🏪",
    client: "Sallustro",
    description: "Trabajos de red, cámaras y sonido",
    issueCount: 6,
  },
  {
    id: "project-fit-for-life",
    name: "Fit For Life",
    icon: "🏋️",
    client: "Sallustro",
    description: "Mantenimiento preventivo y conectividad",
    issueCount: 5,
  },
  {
    id: "project-deposito-central",
    name: "Depósito Logístico",
    icon: "📦",
    client: "Sallustro",
    description: "CCTV perimetral y racks",
    issueCount: 4,
  },
  {
    id: "project-shopping-mariscal",
    name: "Shopping Mariscal",
    icon: "🏬",
    client: "STI Clientes",
    description: "Nueva obra de cableado y sonorización",
    issueCount: 3,
  },
];

export const INITIAL_COLUMNS: Column[] = [
  {
    id: "Backlog",
    title: "Solicitudes (Borrador)",
    dotColor: "rgb(107, 114, 128)",
    tasks: [
      {
        id: "task-1473",
        key: "TAR-1473",
        title: "Revisar iluminación del acceso principal",
        priority: "low",
        leftBarColor: "rgb(59, 130, 246)",
        type: "Mantenimiento",
        typeColor: "rgb(107, 114, 128)",
        tag: "Casa Central",
        tagColor: "rgb(59, 130, 246)",
        hasExtraAssignee: false,
        isOverdue: false,
        assignees: [],
      },
      {
        id: "task-1482",
        key: "TAR-1482",
        title: "Calibración de amplificador de audio ambiental",
        priority: "low",
        leftBarColor: "rgb(59, 130, 246)",
        type: "Sonido",
        typeColor: "rgb(168, 85, 247)",
        tag: "Hering",
        tagColor: "rgb(249, 115, 22)",
        hasExtraAssignee: false,
        isOverdue: false,
        assignees: [],
      },
      {
        id: "task-1492",
        key: "TAR-1492",
        title: "Auditoría de bocinas de sonorización comercial",
        priority: "low",
        leftBarColor: "rgb(59, 130, 246)",
        type: "Sonido",
        typeColor: "rgb(168, 85, 247)",
        tag: "Paseo La Galería",
        tagColor: "rgb(16, 185, 129)",
        hasExtraAssignee: false,
        isOverdue: false,
        assignees: [],
      },
    ],
  },
  {
    id: "Todo",
    title: "Por Hacer (Asignadas)",
    dotColor: "rgb(139, 92, 246)",
    wipLimit: 8,
    tasks: [
      {
        id: "task-1477",
        key: "TAR-1477",
        title: "Revisar puntos de red y enlaces intermitentes",
        priority: "urgent",
        leftBarColor: "rgb(239, 68, 68)",
        type: "Redes",
        typeColor: "rgb(59, 130, 246)",
        tag: "Hering",
        tagColor: "rgb(249, 115, 22)",
        hasExtraAssignee: false,
        isOverdue: true,
        assignees: [
          {
            name: "Mario Riquelme",
            avatarUrl:
              "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1480",
        key: "TAR-1480",
        title: "Instalación de rack de comunicaciones y peinado Cat6",
        priority: "high",
        leftBarColor: "rgb(234, 179, 8)",
        type: "Redes",
        typeColor: "rgb(59, 130, 246)",
        tag: "Casa Central",
        tagColor: "rgb(59, 130, 246)",
        hasExtraAssignee: false,
        isOverdue: false,
        assignees: [
          {
            name: "Diego Ramos",
            avatarUrl:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1483",
        key: "TAR-1483",
        title: "Certificación de cableado estructurado en puestos administrativos",
        priority: "medium",
        leftBarColor: "rgb(234, 179, 8)",
        type: "Cableado",
        typeColor: "rgb(249, 115, 22)",
        tag: "Casa Central",
        tagColor: "rgb(59, 130, 246)",
        hasExtraAssignee: false,
        isOverdue: false,
        assignees: [
          {
            name: "Diego Ramos",
            avatarUrl:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1488",
        key: "TAR-1488",
        title: "Instalación de sensor de movimiento perimetral",
        priority: "medium",
        leftBarColor: "rgb(234, 179, 8)",
        type: "Mantenimiento",
        typeColor: "rgb(107, 114, 128)",
        tag: "Depósito",
        tagColor: "rgb(139, 92, 246)",
        hasExtraAssignee: false,
        isOverdue: false,
        assignees: [
          {
            name: "Carlos Mendoza",
            avatarUrl:
              "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1489",
        key: "TAR-1489",
        title: "Canalización y paso de cables en cielo raso de salón",
        priority: "medium",
        leftBarColor: "rgb(234, 179, 8)",
        type: "Cableado",
        typeColor: "rgb(249, 115, 22)",
        tag: "Hering",
        tagColor: "rgb(249, 115, 22)",
        hasExtraAssignee: false,
        isOverdue: false,
        assignees: [
          {
            name: "Carlos Mendoza",
            avatarUrl:
              "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1496",
        key: "TAR-1496",
        title: "Instalación de protectores de sobretensión en rack principal",
        priority: "medium",
        leftBarColor: "rgb(234, 179, 8)",
        type: "Hardware",
        typeColor: "rgb(16, 185, 129)",
        tag: "Depósito",
        tagColor: "rgb(139, 92, 246)",
        hasExtraAssignee: false,
        isOverdue: false,
        assignees: [
          {
            name: "Diego Ramos",
            avatarUrl:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
    ],
  },
  {
    id: "In Progress",
    title: "En Proceso",
    dotColor: "rgb(0, 83, 165)",
    wipLimit: 5,
    tasks: [
      {
        id: "task-1474",
        key: "TAR-1474",
        title: "Instalar cámara domo en depósito y calibrar ángulo",
        priority: "high",
        leftBarColor: "rgb(249, 115, 22)",
        type: "Cámaras",
        typeColor: "rgb(14, 165, 233)",
        tag: "Hering",
        tagColor: "rgb(249, 115, 22)",
        hasExtraAssignee: true,
        subtasks: { completed: 2, total: 3 },
        isOverdue: false,
        assignees: [
          {
            name: "Diego Ramos",
            avatarUrl:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&auto=format",
          },
          {
            name: "Lucía Benítez",
            avatarUrl:
              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1478",
        key: "TAR-1478",
        title: "Configurar grabador DVR/NVR y backup de cámaras",
        priority: "high",
        leftBarColor: "rgb(249, 115, 22)",
        type: "Cámaras",
        typeColor: "rgb(14, 165, 233)",
        tag: "Paseo La Galería",
        tagColor: "rgb(16, 185, 129)",
        hasExtraAssignee: false,
        subtasks: { completed: 3, total: 4 },
        isOverdue: false,
        assignees: [
          {
            name: "Lucía Benítez",
            avatarUrl:
              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1481",
        key: "TAR-1481",
        title: "Montaje de domo PTZ en sector de carga y descarga",
        priority: "high",
        leftBarColor: "rgb(249, 115, 22)",
        type: "Cámaras",
        typeColor: "rgb(14, 165, 233)",
        tag: "Depósito",
        tagColor: "rgb(139, 92, 246)",
        hasExtraAssignee: false,
        subtasks: { completed: 1, total: 2 },
        isOverdue: true,
        assignees: [
          {
            name: "Lucía Benítez",
            avatarUrl:
              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1484",
        key: "TAR-1484",
        title: "Reemplazo de fuente de alimentación de switch PoE",
        priority: "urgent",
        leftBarColor: "rgb(239, 68, 68)",
        type: "Hardware",
        typeColor: "rgb(16, 185, 129)",
        tag: "Paseo La Galería",
        tagColor: "rgb(16, 185, 129)",
        hasExtraAssignee: false,
        isOverdue: true,
        assignees: [
          {
            name: "Diego Ramos",
            avatarUrl:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1490",
        key: "TAR-1490",
        title: "Alineación de antenas de enlace punto a punto",
        priority: "urgent",
        leftBarColor: "rgb(239, 68, 68)",
        type: "Redes",
        typeColor: "rgb(59, 130, 246)",
        tag: "Casa Central",
        tagColor: "rgb(59, 130, 246)",
        hasExtraAssignee: false,
        isOverdue: false,
        assignees: [
          {
            name: "Diego Ramos",
            avatarUrl:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
    ],
  },
  {
    id: "In Review",
    title: "Finalizadas (Para Firma)",
    dotColor: "rgb(243, 164, 74)",
    wipLimit: 4,
    tasks: [
      {
        id: "task-1475",
        key: "TAR-1475",
        title: "Verificar cableado de red de puestos de caja",
        priority: "medium",
        leftBarColor: "rgb(234, 179, 8)",
        type: "Cableado",
        typeColor: "rgb(249, 115, 22)",
        tag: "Paseo La Galería",
        tagColor: "rgb(16, 185, 129)",
        hasExtraAssignee: false,
        subtasks: { completed: 4, total: 4 },
        isOverdue: false,
        assignees: [
          {
            name: "Mario Riquelme",
            avatarUrl:
              "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1476",
        key: "TAR-1476",
        title: "Mantenimiento de sonido y prueba de parlantes en salón",
        priority: "medium",
        leftBarColor: "rgb(234, 179, 8)",
        type: "Sonido",
        typeColor: "rgb(168, 85, 247)",
        tag: "Casa Central",
        tagColor: "rgb(59, 130, 246)",
        hasExtraAssignee: true,
        subtasks: { completed: 3, total: 3 },
        isOverdue: false,
        assignees: [
          {
            name: "Diego Ramos",
            avatarUrl:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&auto=format",
          },
          {
            name: "Lucía Benítez",
            avatarUrl:
              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1485",
        key: "TAR-1485",
        title: "Mantenimiento preventivo y limpieza de domos exteriores",
        priority: "medium",
        leftBarColor: "rgb(234, 179, 8)",
        type: "Cámaras",
        typeColor: "rgb(14, 165, 233)",
        tag: "Hering",
        tagColor: "rgb(249, 115, 22)",
        hasExtraAssignee: false,
        subtasks: { completed: 2, total: 2 },
        isOverdue: false,
        assignees: [
          {
            name: "Lucía Benítez",
            avatarUrl:
              "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
      {
        id: "task-1494",
        key: "TAR-1494",
        title: "Configuración de VLAN aislada para cámaras IP",
        priority: "high",
        leftBarColor: "rgb(249, 115, 22)",
        type: "Redes",
        typeColor: "rgb(59, 130, 246)",
        tag: "Casa Central",
        tagColor: "rgb(59, 130, 246)",
        hasExtraAssignee: false,
        subtasks: { completed: 2, total: 2 },
        isOverdue: false,
        assignees: [
          {
            name: "Diego Ramos",
            avatarUrl:
              "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&fit=crop&auto=format",
          },
        ],
      },
    ],
  },
];

export const TEAM_MEMBERS = [
  {
    name: "Coordinación Demo",
    role: "Administrador / Supervisor General",
    email: "demo@example.invalid",
    initials: "ML",
  },
  {
    name: "Diego Ramos",
    role: "Técnico Especialista en Redes",
    email: "dramos@stisistemas.com",
    initials: "DR",
  },
  {
    name: "Lucía Benítez",
    role: "Técnica Instaladora CCTV",
    email: "lbenitez@stisistemas.com",
    initials: "LB",
  },
  {
    name: "Mario Riquelme",
    role: "Técnico Audio y Sonorización",
    email: "mriquelme@stisistemas.com",
    initials: "MR",
  },
  {
    name: "Carlos Mendoza",
    role: "Operador de Mantenimiento",
    email: "cmendoza@stisistemas.com",
    initials: "CM",
  },
];

export const RECENT_ACTIVITIES = [
  {
    user: "Diego Ramos",
    action: "cambió el estado de",
    task: "TAR-1476: Mantenimiento de sonido",
    from: "En Proceso",
    to: "Finalizadas (Para Firma)",
    time: "hace 3 horas",
  },
  {
    user: "Lucía Benítez",
    action: "subió evidencia fotográfica a",
    task: "TAR-1474: Instalar cámara domo en depósito",
    time: "hace 4 horas",
  },
  {
    user: "Mario Riquelme",
    action: "confirmó tareas técnicas en",
    task: "TAR-1475: Verificar cableado de red de cajas",
    time: "hace 5 horas",
  },
  {
    user: "Coordinación Demo",
    action: "asignó a Diego Ramos la orden",
    task: "TAR-1480: Instalación de rack de comunicaciones",
    time: "hace 1 día",
  },
  {
    user: "Carlos Mendoza",
    action: "inició trabajo en",
    task: "TAR-1489: Canalización y paso de cables",
    from: "Por Hacer",
    to: "En Proceso",
    time: "hace 1 día",
  },
];
