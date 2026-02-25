import type { ShipmentView } from '../../types/readModel';

type ShipmentListProps = {
  shipments: ShipmentView[];
};

export function ShipmentList({ shipments }: ShipmentListProps) {
  if (shipments.length === 0) {
    return <p className="muted">No shipment yet.</p>;
  }

  return (
    <ul className="inline-list">
      {shipments.map((shipment) => (
        <li key={shipment.shipment_id}>
          {shipment.shipment_id} | {shipment.status} | {shipment.carrier}
        </li>
      ))}
    </ul>
  );
}
