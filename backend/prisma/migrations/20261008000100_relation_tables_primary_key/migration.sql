-- Prisma 6 and later identify the rows of implicit many-to-many tables with a primary key instead of
-- a unique index. Same columns, same uniqueness: no data is touched.

-- AlterTable
ALTER TABLE "_ParentToStudent" ADD CONSTRAINT "_ParentToStudent_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_ParentToStudent_AB_unique";

-- AlterTable
ALTER TABLE "_PermissionToUser" ADD CONSTRAINT "_PermissionToUser_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_PermissionToUser_AB_unique";

-- AlterTable
ALTER TABLE "_RoomSubjects" ADD CONSTRAINT "_RoomSubjects_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_RoomSubjects_AB_unique";

