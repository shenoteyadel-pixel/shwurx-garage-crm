// Plain (non-"use server") module for appointment logistics constants and
// types shared between server actions and client components. Keeping these out
// of the "use server" action file is required, since that file may only export
// async functions.

export type AppointmentType = "dropoff" | "pickup" | "pickup_delivery"

export type FulfillmentStatus =
  | "booked"
  | "driver_assigned"
  | "en_route_pickup"
  | "vehicle_collected"
  | "at_workshop"
  | "ready_for_delivery"
  | "en_route_delivery"
  | "delivered"

/** Fulfillment stages a booking moves through, in order, for the CRM UI. */
export const FULFILLMENT_FLOW: { value: FulfillmentStatus; label: string }[] = [
  { value: "booked", label: "Booked" },
  { value: "driver_assigned", label: "Driver assigned" },
  { value: "en_route_pickup", label: "En route to pickup" },
  { value: "vehicle_collected", label: "Vehicle collected" },
  { value: "at_workshop", label: "At workshop" },
  { value: "ready_for_delivery", label: "Ready for delivery" },
  { value: "en_route_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
]
