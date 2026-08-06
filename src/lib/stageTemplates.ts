export const STAGE_TEMPLATES: Record<string, { label: string; stages: string[] }> = {
  paper_print: {
    label: 'Paper Print (hangers, danglers, shelf talkers, wobblers)',
    stages: ['raw_material_ready', 'die_cutting', 'printing', 'lamination', 'pasting', 'qc_check', 'packing'],
  },
  corrugated_pos: {
    label: 'Corrugated POS (FSUs, counter displays, dump bins)',
    stages: ['raw_material_ready', 'printing', 'die_cutting', 'lamination', 'pasting_assembly', 'fitment_check', 'qc_check', 'packing'],
  },
  acrylic_pos: {
    label: 'Acrylic POS (counter units, display stands, menu holders)',
    stages: ['material_procurement', 'laser_cutting', 'bending_forming', 'polishing', 'branding_uv_print', 'assembly', 'qc_check', 'packing'],
  },
  metal_pos: {
    label: 'Metal POS (racks, gondolas, floor stands)',
    stages: ['material_procurement', 'fabrication_welding', 'surface_treatment', 'powder_coating', 'branding_vinyl', 'assembly', 'qc_check', 'packing'],
  },
  mixed_material: {
    label: 'Mixed Material (wood + acrylic, metal + print)',
    stages: ['material_procurement', 'fabrication', 'surface_finish', 'print_branding', 'assembly', 'fitment_check', 'qc_check', 'packing'],
  },
};

/** Explicit overrides where plain title-casing isn't enough. */
const STAGE_LABELS: Record<string, string> = {
  qc_check: 'QC Check',
  pasting_assembly: 'Pasting & Assembly',
  bending_forming: 'Bending & Forming',
  branding_uv_print: 'Branding / UV Print',
  fabrication_welding: 'Fabrication & Welding',
  branding_vinyl: 'Branding / Vinyl',
  print_branding: 'Print & Branding',
};

export function prettyStage(s?: string | null): string {
  const key = (s || '').trim().toLowerCase();
  if (!key) return '—';
  if (STAGE_LABELS[key]) return STAGE_LABELS[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
