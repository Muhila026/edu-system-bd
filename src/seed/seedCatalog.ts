import { FeeStructure } from '../models/FeeStructure'
import { InventoryItem } from '../models/InventoryItem'
import { AfterSchoolClass } from '../models/AfterSchoolClass'
import { seedAcademicStructure } from './seedAcademicStructure'

/** Seeds the academic structure, then fee/item/after-school-class catalogs, on first run. */
export async function seedCatalog(): Promise<void> {
  const { academicYearId, termIds, gradeIds } = await seedAcademicStructure()

  const feeCount = await FeeStructure.count()
  if (feeCount === 0) {
    // Grade + term scoped fees for every grade (Grade 1..13), matching the
    // "Grade 1 → Term 1/2/3 Fee" structure from the spec.
    const gradeTermFees = gradeIds.flatMap((gradeId, i) =>
      (['Term 1', 'Term 2', 'Term 3'] as const).map((termName) => ({
        feeType: 'School Fee' as const,
        title: `Grade ${i + 1} — ${termName} School Fee`,
        academicYearId,
        gradeId,
        termId: termIds[termName],
        amount: 3500,
      }))
    )

    // School-wide fees that aren't grade/term scoped.
    const generalFees = [
      { feeType: 'Admission Fee' as const, title: 'Admission Fee', description: 'One-time admission fee', amount: 5000 },
      { feeType: 'Term 1 Exam Fee' as const, title: 'Term 1 Exam Fee', amount: 1200, academicYearId, termId: termIds['Term 1'] },
      { feeType: 'Term 2 Exam Fee' as const, title: 'Term 2 Exam Fee', amount: 1200, academicYearId, termId: termIds['Term 2'] },
      { feeType: 'Term 3 Exam Fee' as const, title: 'Term 3 Exam Fee', amount: 1200, academicYearId, termId: termIds['Term 3'] },
      { feeType: 'Event/Activity Fee' as const, title: 'Sports Meet', description: 'Annual sports meet participation fee', amount: 500 },
      { feeType: 'Event/Activity Fee' as const, title: 'School Trip', description: 'Educational school trip', amount: 2000 },
      {
        feeType: 'After-School Class Admission Fee' as const,
        title: 'After-School Class Admission Fee (O/L & A/L)',
        description: 'Initial payment to join an after-school class',
        amount: 900,
      },
    ]

    await FeeStructure.bulkCreate([...gradeTermFees, ...generalFees])
    console.log(`[seed] Created default fee structures (${gradeTermFees.length} grade/term fees + ${generalFees.length} general fees)`)
  }

  const itemCount = await InventoryItem.count()
  if (itemCount === 0) {
    await InventoryItem.bulkCreate([
      { name: 'Report Card', price: 0 },
      { name: 'Communication Book', price: 150 },
      { name: 'Uniform Set', price: 1200 },
      { name: 'Cap', price: 200 },
      { name: 'Badge', price: 100 },
      { name: 'Tie', price: 150 },
      {
        name: 'Uniform Package (Bundle)',
        price: 1500,
        isPackage: true,
        packageItems: JSON.stringify(['Uniform Set', 'Cap', 'Badge', 'Tie']),
      },
    ])
    console.log('[seed] Created default inventory items')
  }

  const classCount = await AfterSchoolClass.count()
  if (classCount === 0) {
    await AfterSchoolClass.bulkCreate([
      {
        name: 'Computer / IT Course',
        description: 'Basic computer literacy and IT skills',
        schedule: 'Mon & Wed, 3:30–5:00 PM',
        level: 'All',
        admissionFee: 900,
      },
      {
        name: 'Abacus',
        description: 'Mental arithmetic using the abacus',
        schedule: 'Tue & Thu, 3:30–4:30 PM',
        level: 'All',
        admissionFee: 900,
      },
      {
        name: 'Electrician Training',
        description: 'Hands-on basic electrician training',
        schedule: 'Fri, 3:30–5:30 PM',
        level: 'O/L',
        admissionFee: 900,
      },
    ])
    console.log('[seed] Created default after-school classes')
  }
}
