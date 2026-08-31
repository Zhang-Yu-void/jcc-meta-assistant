import { z } from "zod";

export const SourceSchema = z.object({
  platform: z.string().min(1),
  title: z.string(),
  url: z.string(),
});

export const ChampionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cost: z.number().int().min(1).max(5),
  traits: z.array(z.string()),
});

export const TraitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  breakpoints: z.array(z.number().int().positive()),
});

export const CompositionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: z.enum(["S", "A", "B"]),
  winRateHint: z.number().min(0).max(1),
  pickRateHint: z.number().min(0).max(1),
  sources: z.array(SourceSchema),
  core: z.array(z.string()),
  units: z.array(z.string()).min(1),
  priority: z.array(z.string()),
  notes: z.string(),
});

export const MetaBundleSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.string().min(1),
  setId: z.string().min(1),
  setName: z.string().min(1),
  champions: z.array(ChampionSchema),
  traits: z.array(TraitSchema),
  compositions: z.array(CompositionSchema),
});

export type MetaBundle = z.infer<typeof MetaBundleSchema>;
export type Champion = z.infer<typeof ChampionSchema>;
export type Trait = z.infer<typeof TraitSchema>;
export type Composition = z.infer<typeof CompositionSchema>;

export function parseMetaBundle(input: unknown): MetaBundle {
  return MetaBundleSchema.parse(input);
}
