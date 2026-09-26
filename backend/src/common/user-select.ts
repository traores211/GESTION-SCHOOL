/** Fields of a User that may leave the API. Never include `password` (bcrypt hash). */
export const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  status: true,
} as const;
