import { Router } from 'express'
import authRoutes from './auth.routes'
import dashboardRoutes from './dashboard.routes'
import permissionsRoutes from './permissions.routes'
import usersRoutes from './users.routes'
import rolesRoutes from './roles.routes'
import teachersRoutes from './teachers.routes'
import studentsRoutes from './students.routes'
import academicRoutes from './academic.routes'
import subjectsRoutes from './subjects.routes'
import feesRoutes from './fees.routes'
import itemsRoutes from './items.routes'
import afterSchoolClassesRoutes from './afterSchoolClasses.routes'
import transactionsRoutes from './transactions.routes'
import paymentsRoutes from './payments.routes'
import paymentRequestsRoutes from './paymentRequests.routes'
import superadminRoutes from './superadmin.routes'
import parentsRoutes from './parents.routes'
import schoolRoutes from './school.routes'

const router = Router()

router.use('/auth', authRoutes)
router.use(schoolRoutes)
router.use(dashboardRoutes)
router.use(permissionsRoutes)
router.use(usersRoutes)
router.use(rolesRoutes)
router.use(teachersRoutes)
router.use(studentsRoutes)
router.use(academicRoutes)
router.use(subjectsRoutes)
router.use(feesRoutes)
router.use(itemsRoutes)
router.use(afterSchoolClassesRoutes)
router.use(transactionsRoutes)
router.use(paymentsRoutes)
router.use(paymentRequestsRoutes)
router.use(superadminRoutes)
router.use(parentsRoutes)

export default router
