import { z } from "zod";

export const triggerSosSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export type TriggerSosInput = z.infer<typeof triggerSosSchema>;
