// Decisions consume only server-verified identities and permissions, never body roles.
export function canManageRfq(trustedAutomation: boolean, admin: boolean, rfqAccess: boolean) {
  return trustedAutomation || admin || rfqAccess;
}

export function canSyncZoho(service: boolean, admin: boolean, requestedSupplier: string | null, ownSupplier: string | null) {
  return service || admin || Boolean(requestedSupplier && ownSupplier && requestedSupplier === ownSupplier);
}

export function validDispatchKey(provided: string | null, expected: string | undefined) {
  return Boolean(expected && provided && provided === expected);
}