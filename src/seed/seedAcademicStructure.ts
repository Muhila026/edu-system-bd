import { AcademicYear } from '../models/AcademicYear'
import { Term } from '../models/Term'
import { Grade } from '../models/Grade'

/** Seeds the current academic year, its 3 terms, and Grades 1–13 on first run. */
export async function seedAcademicStructure(): Promise<{ academicYearId: number; termIds: Record<string, number>; gradeIds: number[] }> {
  const currentYear = new Date().getFullYear()

  let academicYear = await AcademicYear.findOne({ where: { isCurrent: true } })
  if (!academicYear) {
    academicYear = await AcademicYear.create({ year: currentYear, isCurrent: true })
    console.log(`[seed] Created current academic year: ${currentYear}`)
  }

  const termNames: Array<'Term 1' | 'Term 2' | 'Term 3'> = ['Term 1', 'Term 2', 'Term 3']
  const termIds: Record<string, number> = {}
  for (const name of termNames) {
    let term = await Term.findOne({ where: { academicYearId: academicYear.id, name } })
    if (!term) {
      term = await Term.create({ academicYearId: academicYear.id, name })
    }
    termIds[name] = term.id
  }

  const gradeCount = await Grade.count()
  const gradeIds: number[] = []
  if (gradeCount === 0) {
    const grades = await Grade.bulkCreate(
      Array.from({ length: 13 }, (_, i) => ({ name: `Grade ${i + 1}`, order: i + 1 }))
    )
    gradeIds.push(...grades.map((g) => g.id))
    console.log('[seed] Created Grade 1–13')
  } else {
    const grades = await Grade.findAll({ order: [['order', 'ASC']] })
    gradeIds.push(...grades.map((g) => g.id))
  }

  return { academicYearId: academicYear.id, termIds, gradeIds }
}
