export const DEMOGRAPHIC_FIELDS = [
  {
    key: 'ageRange',
    label: 'Age range',
    type: 'select',
    options: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+', 'Prefer not to say'],
  },
  {
    key: 'gender',
    label: 'Gender',
    type: 'select',
    options: ['Woman', 'Man', 'Non-binary', 'Prefer to self-describe', 'Prefer not to say'],
  },
  {
    key: 'countryRegion',
    label: 'Country / region',
    type: 'text',
  },
  {
    key: 'language',
    label: 'Primary language',
    type: 'text',
  },
  {
    key: 'occupation',
    label: 'Occupation / role',
    type: 'text',
  },
  {
    key: 'device',
    label: 'Main device used for the study',
    type: 'select',
    options: ['iPhone', 'Android phone', 'Tablet', 'Computer', 'Other'],
  },
  {
    key: 'accessibilityNeeds',
    label: 'Accessibility needs',
    type: 'textarea',
  },
] as const

export type DemographicFieldKey = typeof DEMOGRAPHIC_FIELDS[number]['key']

export const DEMOGRAPHIC_FIELD_KEYS = DEMOGRAPHIC_FIELDS.map((field) => field.key)

export function demographicFieldLabel(key: string) {
  return DEMOGRAPHIC_FIELDS.find((field) => field.key === key)?.label ?? key
}

export function normalizeDemographicFields(values: FormDataEntryValue[]) {
  const allowed = new Set<string>(DEMOGRAPHIC_FIELD_KEYS)
  const seen = new Set<string>()
  const fields: string[] = []
  for (const value of values) {
    const key = String(value)
    if (!allowed.has(key) || seen.has(key)) continue
    seen.add(key)
    fields.push(key)
  }
  return fields
}
