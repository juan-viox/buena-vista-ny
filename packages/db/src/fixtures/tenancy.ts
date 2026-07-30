// ============================================================
// Tenancy fixtures — Buena Vista Restaurant & Bar (tenant #1).
// ============================================================

import type { Location, Tenant, User } from '../types';

export const TENANT_ID = 'ten_buenavista';
export const LOC_HK = 'loc_hells_kitchen';
export const LOC_EV = 'loc_east_village';

export const TENANT: Tenant = {
  id: TENANT_ID,
  slug: 'buena-vista',
  name: 'Buena Vista Restaurant & Bar',
  theme: { accent: '#C9995C', primary: '#1E3A5F', logoText: 'BUENA VISTA' },
  createdAt: '2025-11-03T14:20:00-05:00',
};

export const LOCATIONS: Location[] = [
  {
    id: LOC_HK,
    tenantId: TENANT_ID,
    name: "Hell's Kitchen",
    address: '536 9th Ave, New York, NY 10018',
    phone: '(212) 388-5040',
    timezone: 'America/New_York',
  },
  {
    id: LOC_EV,
    tenantId: TENANT_ID,
    name: 'East Village',
    address: '88 2nd Ave, New York, NY 10003',
    phone: '(929) 220-0547',
    timezone: 'America/New_York',
  },
];

export const USERS: User[] = [
  {
    id: 'usr_christian',
    tenantId: TENANT_ID,
    name: 'Christian Nuñez',
    email: 'christian@buenavistany.com',
    role: 'owner',
    locationIds: [], // all locations
  },
  {
    id: 'usr_marisol',
    tenantId: TENANT_ID,
    name: 'Marisol Guzmán',
    email: 'marisol@buenavistany.com',
    role: 'gm',
    locationIds: [LOC_HK],
  },
  {
    id: 'usr_dana',
    tenantId: TENANT_ID,
    name: 'Dana Whitfield',
    email: 'dana@buenavistany.com',
    role: 'gm',
    locationIds: [LOC_EV],
  },
  {
    id: 'usr_rafael',
    tenantId: TENANT_ID,
    name: 'Rafael Ortega',
    email: 'chef@buenavistany.com',
    role: 'chef',
    locationIds: [], // executive chef across both kitchens
  },
  {
    id: 'usr_lucia',
    tenantId: TENANT_ID,
    name: 'Lucía Herrera',
    email: 'events@buenavistany.com',
    role: 'events',
    locationIds: [],
  },
  {
    id: 'usr_priya',
    tenantId: TENANT_ID,
    name: 'Priya Raman',
    email: 'marketing@buenavistany.com',
    role: 'marketing',
    locationIds: [],
  },
];
