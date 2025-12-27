import { z } from 'zod';

export const RunwaySchema = z.object({
    ident: z.string(),
    length_ft: z.number(),
    width_ft: z.number(),
    surface: z.string(),
    lighted: z.boolean(),
    closed: z.boolean(),
});

export const AirportSchema = z.object({
    id: z.string(), // e.g. "KHEF"
    name: z.string(),
    elevation_ft: z.number(),
    location: z.object({
        lat: z.number(),
        lon: z.number(),
    }),
    runways: z.array(RunwaySchema),
});

export type Runway = z.infer<typeof RunwaySchema>;
export type Airport = z.infer<typeof AirportSchema>;
