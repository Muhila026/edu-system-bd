-- ============================================================================
-- School Management System — Database Schema Reference (MySQL 8)
-- ============================================================================
-- This file documents the schema exactly as it's defined by the Sequelize
-- models in src/models/*.ts. You do NOT need to run this file by hand —
-- sequelize.sync() (see src/server.ts) creates/updates these tables
-- automatically every time the server starts. This script is provided
-- purely as a readable reference / for teams that prefer raw SQL migrations.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `school_management`;
USE `school_management`;

-- ----------------------------------------------------------------------------
-- users — all logins: Student, Teacher, Admin (office/billing staff), Super Admin (CEO/management)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `name`          VARCHAR(150) NOT NULL,
  `email`         VARCHAR(150) NOT NULL UNIQUE,
  `passwordHash`  VARCHAR(255) NOT NULL,
  `role`          ENUM('Student','Teacher','Admin','Super Admin') NOT NULL,
  `status`        ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  `joinedDate`    DATE NOT NULL,
  `createdAt`     DATETIME NOT NULL,
  `updatedAt`     DATETIME NOT NULL
);

-- ----------------------------------------------------------------------------
-- student_profiles — academic/enrollment details for role=Student users
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `student_profiles` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `userId`           INT NOT NULL UNIQUE REFERENCES `users`(`id`),
  `level`            ENUM('O/L','A/L','Standard') NOT NULL DEFAULT 'Standard',
  `grade`            VARCHAR(50) NULL,
  `guardianName`     VARCHAR(150) NULL,
  `guardianContact`  VARCHAR(50) NULL,
  `admissionDate`    DATE NOT NULL,
  `createdAt`        DATETIME NOT NULL,
  `updatedAt`        DATETIME NOT NULL
);

-- ----------------------------------------------------------------------------
-- subjects — basic academic subject catalog
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `subjects` (
  `id`              INT AUTO_INCREMENT PRIMARY KEY,
  `subjectName`     VARCHAR(150) NOT NULL,
  `attendanceDays`  INT NULL,
  `createdAt`       DATETIME NOT NULL,
  `updatedAt`       DATETIME NOT NULL
);

-- ----------------------------------------------------------------------------
-- fee_structures — the fee catalog: School Fee, Admission Fee, 3 Term Exam
-- Fees, Event/Activity Fee, After-School Class Admission Fee (Rs. 900)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fee_structures` (
  `id`           INT AUTO_INCREMENT PRIMARY KEY,
  `feeType`      ENUM(
                   'School Fee','Admission Fee',
                   'Term 1 Exam Fee','Term 2 Exam Fee','Term 3 Exam Fee',
                   'Event/Activity Fee','After-School Class Admission Fee'
                 ) NOT NULL,
  `title`        VARCHAR(200) NOT NULL,
  `description`  TEXT NULL,
  `amount`       DECIMAL(10,2) NOT NULL,
  `dueDate`      DATE NULL,
  `createdAt`    DATETIME NOT NULL,
  `updatedAt`    DATETIME NOT NULL
);

-- ----------------------------------------------------------------------------
-- fee_records — a fee_structure assigned to one student, with running balance
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fee_records` (
  `id`               INT AUTO_INCREMENT PRIMARY KEY,
  `feeStructureId`   INT NOT NULL REFERENCES `fee_structures`(`id`),
  `studentId`        INT NOT NULL REFERENCES `users`(`id`),
  `amount`           DECIMAL(10,2) NOT NULL,
  `paidAmount`       DECIMAL(10,2) NOT NULL DEFAULT 0,
  `status`           ENUM('Paid','Unpaid','Partial') NOT NULL DEFAULT 'Unpaid',
  `paidDate`         DATE NULL,
  `createdAt`        DATETIME NOT NULL,
  `updatedAt`        DATETIME NOT NULL
);

-- ----------------------------------------------------------------------------
-- inventory_items — the item/package catalog with stock on hand
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `name`           ENUM(
                     'Report Card','Communication Book','Uniform Set',
                     'Cap','Badge','Tie','Uniform Package (Bundle)'
                   ) NOT NULL,
  `price`          DECIMAL(10,2) NOT NULL DEFAULT 0,
  `isPackage`      BOOLEAN NOT NULL DEFAULT FALSE,
  `packageItems`   TEXT NULL COMMENT 'JSON array of item names when isPackage=true',
  `stockQuantity`  INT NULL DEFAULT 100 COMMENT 'NULL = untracked/unlimited',
  `createdAt`      DATETIME NOT NULL,
  `updatedAt`      DATETIME NOT NULL
);

-- ----------------------------------------------------------------------------
-- item_records — items issued to a specific student (decrements stock)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `item_records` (
  `id`                INT AUTO_INCREMENT PRIMARY KEY,
  `itemName`          ENUM(
                        'Report Card','Communication Book','Uniform Set',
                        'Cap','Badge','Tie','Uniform Package (Bundle)'
                      ) NOT NULL,
  `inventoryItemId`   INT NULL REFERENCES `inventory_items`(`id`),
  `studentId`         INT NOT NULL REFERENCES `users`(`id`),
  `quantity`          INT NOT NULL DEFAULT 1,
  `issuedDate`        DATE NOT NULL,
  `notes`             TEXT NULL,
  `createdAt`         DATETIME NOT NULL,
  `updatedAt`         DATETIME NOT NULL
);

-- ----------------------------------------------------------------------------
-- after_school_classes — Computer/IT, Abacus, Electrician Training catalog
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `after_school_classes` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `name`           ENUM('Computer / IT Course','Abacus','Electrician Training') NOT NULL,
  `description`    TEXT NULL,
  `schedule`       VARCHAR(200) NULL,
  `level`          ENUM('O/L','A/L','All') NOT NULL DEFAULT 'All',
  `admissionFee`   DECIMAL(10,2) NOT NULL DEFAULT 900,
  `totalFee`       DECIMAL(10,2) NULL COMMENT 'Full course fee, for tracking installment balance',
  `createdAt`      DATETIME NOT NULL,
  `updatedAt`      DATETIME NOT NULL
);

-- ----------------------------------------------------------------------------
-- class_enrollments — a student's enrollment + running installment balance
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `class_enrollments` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `classId`        INT NOT NULL REFERENCES `after_school_classes`(`id`),
  `studentId`      INT NOT NULL REFERENCES `users`(`id`),
  `enrolledDate`   DATE NOT NULL,
  `status`         ENUM('Active','Pending','Completed') NOT NULL DEFAULT 'Pending',
  `amountPaid`     DECIMAL(10,2) NOT NULL DEFAULT 0,
  `createdAt`      DATETIME NOT NULL,
  `updatedAt`      DATETIME NOT NULL
);

-- ----------------------------------------------------------------------------
-- transactions — the audit trail / receipt log for every cash payment
-- (fee, item purchase, or after-school installment). This is what the
-- Super Admin's financial analytics and daily cash reconciliation read from.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transactions` (
  `id`                 INT AUTO_INCREMENT PRIMARY KEY,
  `studentId`          INT NOT NULL REFERENCES `users`(`id`),
  `amount`             DECIMAL(10,2) NOT NULL,
  `paymentDate`        DATE NOT NULL,
  `type`               ENUM('Fee','Item','After-School Class') NOT NULL,
  `referenceId`        INT NULL COMMENT 'fee_records.id / inventory_items.id / class_enrollments.id depending on type',
  `receiptNumber`      VARCHAR(50) NOT NULL UNIQUE,
  `notes`              TEXT NULL,
  `paymentMode`        ENUM('Cash','Manual','Online') NOT NULL DEFAULT 'Cash',
  `collectedByUserId`  INT NULL REFERENCES `users`(`id`) COMMENT 'Admin/Super Admin who processed the payment',
  `createdAt`          DATETIME NOT NULL,
  `updatedAt`          DATETIME NOT NULL
);
