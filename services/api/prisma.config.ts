import 'dotenv/config';
import { defineConfig } from 'prisma/config';
export default defineConfig({ schema: 'prisma/schema.prisma', datasource: { url: process.env.DATABASE_URL || 'postgresql://firewatch:firewatch-local-only@localhost:5435/firewatch' } });
