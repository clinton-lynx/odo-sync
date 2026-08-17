import { prisma } from "./prisma.js";

export interface WorkshopInfo {
  businessName: string;
  address?: string;
  operatingHours?: string;
  serviceDescription?: string;
  phoneNumber?: string;
}

export const WORKSHOP_SETTINGS_ID = "default";

export const DEFAULT_WORKSHOP_INFO: WorkshopInfo = {
  businessName: "OdoSync Demo Workshop",
  address: "Demo workshop, Ikeja, Lagos",
  operatingHours: "Mon–Sat, 8am–6pm",
  serviceDescription:
    "Includes oil change, filter replacement, and brake check",
};

function toWorkshopInfo(row: {
  businessName: string;
  address: string | null;
  operatingHours: string | null;
  serviceDescription: string | null;
  phoneNumber: string | null;
}): WorkshopInfo {
  return {
    businessName: row.businessName,
    address: row.address ?? undefined,
    operatingHours: row.operatingHours ?? undefined,
    serviceDescription: row.serviceDescription ?? undefined,
    phoneNumber: row.phoneNumber ?? undefined,
  };
}

/** Fetch the live workshop profile, creating the fictional seed default once if absent. */
export async function getWorkshopInfo(): Promise<WorkshopInfo> {
  const row = await prisma.workshopSettings.upsert({
    where: { id: WORKSHOP_SETTINGS_ID },
    update: {},
    create: {
      id: WORKSHOP_SETTINGS_ID,
      ...DEFAULT_WORKSHOP_INFO,
      phoneNumber: null,
    },
  });
  return toWorkshopInfo(row);
}

function optionalField(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() || null;
}

/** Persist user-editable workshop facts and return the stored profile. */
export async function updateWorkshopInfo(
  patch: Partial<WorkshopInfo>,
): Promise<WorkshopInfo> {
  const businessName = patch.businessName?.trim();
  if (patch.businessName !== undefined && !businessName) {
    throw new Error("Workshop business name cannot be empty");
  }

  const data = {
    businessName,
    address: optionalField(patch.address),
    operatingHours: optionalField(patch.operatingHours),
    serviceDescription: optionalField(patch.serviceDescription),
    phoneNumber: optionalField(patch.phoneNumber),
  };

  const row = await prisma.workshopSettings.upsert({
    where: { id: WORKSHOP_SETTINGS_ID },
    update: data,
    create: {
      id: WORKSHOP_SETTINGS_ID,
      ...DEFAULT_WORKSHOP_INFO,
      ...data,
      businessName: businessName ?? DEFAULT_WORKSHOP_INFO.businessName,
    },
  });
  return toWorkshopInfo(row);
}
