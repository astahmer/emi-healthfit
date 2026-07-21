import type { HealthfitDatabaseSchema, IngestedDataExport } from "@emi/flavor-healthfit";
import {
  importIngestedData as importIngestedDataFlavor,
  ingestedDataExportSchema,
  previewIngestedDataImport as previewIngestedDataImportFlavor,
} from "@emi/flavor-healthfit";
import { narrowQueryDatabaseClient, type QueryDatabaseClient } from "../../platform/db/client.ts";

export { ingestedDataExportSchema, type IngestedDataExport };

const toFitnessDb = (db: QueryDatabaseClient) =>
  narrowQueryDatabaseClient<HealthfitDatabaseSchema>(db);

export const previewIngestedDataImport = ({
  db,
  userId,
  data,
}: {
  db: QueryDatabaseClient;
  userId: string;
  data: IngestedDataExport;
}) => previewIngestedDataImportFlavor({ db: toFitnessDb(db), userId, data });

export const importIngestedData = ({
  db,
  userId,
  data,
}: {
  db: QueryDatabaseClient;
  userId: string;
  data: IngestedDataExport;
}) => importIngestedDataFlavor({ db: toFitnessDb(db), userId, data });
