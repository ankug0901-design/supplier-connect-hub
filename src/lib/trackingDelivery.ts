export function isOrderDelivered(overallStatus: string, shipmentStatuses: string[]): boolean {
  return overallStatus.toLowerCase() === 'delivered' ||
    (shipmentStatuses.length > 0 && shipmentStatuses.every((status) => status === 'delivered'));
}