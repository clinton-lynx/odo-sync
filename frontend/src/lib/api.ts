/**
 * OdoSync API client — the single, genuine connection layer between the
 * (frontend-only) Next.js app and the standalone Express backend.
 *
 * There are no Next.js API routes: every piece of data is fetched over REST from
 * the backend at NEXT_PUBLIC_API_URL. The types below mirror the backend's
 * Prisma models and route response shapes exactly (dates arrive as ISO strings
 * over JSON, so they are typed as `string`).
 */

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/+$/, "");

/* ------------------------------------------------------------------ */
/* Enums (string unions mirroring the Prisma enums)                    */
/* ------------------------------------------------------------------ */

export type CallWindow = "MORNING" | "AFTERNOON" | "EVENING";
export type CallStage = "FIFTEEN_DAY" | "TEN_DAY" | "FIVE_DAY";
export type CallJobStatus = "PENDING" | "FIRED" | "CANCELLED";
export type CallOutcome =
  | "BOOKED"
  | "DECLINED"
  | "CALLBACK_REQUESTED"
  | "NO_ANSWER";

export const CALL_WINDOWS: CallWindow[] = ["MORNING", "AFTERNOON", "EVENING"];
export const CALL_STAGES: CallStage[] = ["FIFTEEN_DAY", "TEN_DAY", "FIVE_DAY"];

export interface WorkshopInfo {
  businessName: string;
  address?: string;
  operatingHours?: string;
  serviceDescription?: string;
  phoneNumber?: string;
}

/* ------------------------------------------------------------------ */
/* Entity types                                                        */
/* ------------------------------------------------------------------ */

export interface Vehicle {
  regnNo: string;
  makeModel: string;
  ownerName: string;
  phoneNumber: string;
  company: string | null;
  department: string | null;
  lastServiceDate: string;
  lastServiceMileage: number | null;
  preferredWindow: CallWindow;
  createdAt: string;
  updatedAt: string;
}

export interface CallResult {
  id: string;
  callJobId: string;
  firedAt: string;
  outcome: CallOutcome;
  proposedAppointmentDate: string | null;
  notes: string | null;
  calleCallId: string | null;
  providerCallId: string | null;
  providerAttemptStatus: string | null;
  providerFailureCode: string | null;
  providerFailureMessage: string | null;
}

export interface CallJob {
  id: string;
  vehicleRegnNo: string;
  stage: CallStage;
  scheduledFireDate: string;
  preferredWindow: CallWindow;
  status: CallJobStatus;
  createdAt: string;
}

/** Vehicle list rows include a count of their call jobs. */
export type VehicleWithCount = Vehicle & {
  _count: { callJobs: number };
};

/** A single vehicle is returned with its jobs (each with its result). */
export type VehicleWithJobs = Vehicle & {
  callJobs: Array<CallJob & { result: CallResult | null }>;
};

/** Call-job endpoints include the related vehicle and (sometimes) result. */
export type CallJobWithRelations = CallJob & {
  vehicle?: Vehicle;
  result?: CallResult | null;
};

/* ------------------------------------------------------------------ */
/* Response / input shapes                                             */
/* ------------------------------------------------------------------ */

export interface HealthResponse {
  ok: boolean;
  service: string;
  db: "up" | "down" | string;
  calle: "live" | "dry-run";
  time: string;
}

export interface FiredJobSummary {
  jobId: string;
  regnNo: string;
  stage: CallStage;
  outcome: string;
  dryRun: boolean;
}

export interface FireSummary {
  checked: number;
  fired: number;
  skippedWindow: number;
  failed: number;
  results: FiredJobSummary[];
}

export interface SettingsResponse {
  workshop: WorkshopInfo;
  defaultWindow: CallWindow;
  serviceIntervalDays: number;
  windows: Record<CallWindow, { startHour: number; endHour: number }>;
  distribution: Record<CallWindow, number>;
}

export interface UpdateSettingsResponse {
  workshop: WorkshopInfo;
  defaultWindow: CallWindow;
  updatedVehicles: number;
}

export interface CloseOutResponse {
  vehicle: VehicleWithJobs;
  nextDueDate: string;
  createdJobs: CallJob[];
}

export interface NewVehicleInput {
  regnNo: string;
  makeModel: string;
  ownerName: string;
  phoneNumber: string;
  lastServiceDate: string; // ISO date
  company?: string | null;
  department?: string | null;
  lastServiceMileage?: number | null;
  preferredWindow?: CallWindow;
}

export type UpdateVehicleInput = Partial<Omit<NewVehicleInput, "regnNo">>;

export interface FireInput {
  respectWindow?: boolean;
  regnNo?: string;
  jobId?: string;
  limit?: number;
}

export interface CloseOutInput {
  regnNo: string;
  serviceDate?: string; // ISO date; defaults server-side to now
  mileage?: number;
}

export interface UpdateSettingsInput {
  workshop?: Partial<WorkshopInfo>;
  defaultWindow?: CallWindow;
  applyToAllVehicles?: CallWindow;
}

/* ------------------------------------------------------------------ */
/* Low-level request helper                                            */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      // Always hit the live backend — never serve stale data from Next's cache.
      cache: "no-store",
    });
  } catch (cause) {
    throw new ApiError(
      0,
      `Cannot reach OdoSync API at ${API_BASE_URL}. Is the backend running?`,
      cause,
    );
  }

  const raw = await res.text();
  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw; // non-JSON body (e.g. an upstream error page)
    }
  }

  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : res.statusText || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }

  return data as T;
}

/* ------------------------------------------------------------------ */
/* Endpoint functions (1:1 with the backend routes)                    */
/* ------------------------------------------------------------------ */

export const api = {
  // --- health ---
  health: () => request<HealthResponse>("/health"),

  // --- vehicles ---
  listVehicles: () => request<VehicleWithCount[]>("/api/vehicles"),

  getVehicle: (regnNo: string) =>
    request<VehicleWithJobs>(`/api/vehicles/${encodeURIComponent(regnNo)}`),

  createVehicle: (input: NewVehicleInput) =>
    request<Vehicle>("/api/vehicles", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateVehicle: (regnNo: string, patch: UpdateVehicleInput) =>
    request<Vehicle>(`/api/vehicles/${encodeURIComponent(regnNo)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  // --- call jobs ---
  listCallJobs: (filters: {
    status?: CallJobStatus;
    stage?: CallStage;
    regnNo?: string;
  } = {}) =>
    request<CallJobWithRelations[]>(
      `/api/call-jobs${buildQuery({
        status: filters.status,
        stage: filters.stage,
        regnNo: filters.regnNo,
      })}`,
    ),

  getDueCallJobs: () =>
    request<CallJobWithRelations[]>("/api/call-jobs/due"),

  getCallJob: (id: string) =>
    request<CallJobWithRelations>(`/api/call-jobs/${encodeURIComponent(id)}`),

  fireCallJobs: (input: FireInput = {}) =>
    request<FireSummary>("/api/call-jobs/fire", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  cancelCallJob: (id: string) =>
    request<CallJob>(`/api/call-jobs/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    }),

  // --- close-out ---
  closeOut: (input: CloseOutInput) =>
    request<CloseOutResponse>("/api/close-out", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // --- settings ---
  getSettings: () => request<SettingsResponse>("/api/settings"),

  updateSettings: (patch: UpdateSettingsInput) =>
    request<UpdateSettingsResponse>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
};

export default api;
