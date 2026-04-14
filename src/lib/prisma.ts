import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from './encryption';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  // ── 敏感字段加密中间件 ──
  // Client: phone, email, wechat, address
  // User: phone

  const ENCRYPTED_FIELDS: Record<string, string[]> = {
    Client: ['phone', 'email', 'wechat', 'address'],
    User: ['phone'],
  };

  // 加密/解密中间件
  client.$use(async (params, next) => {
    const model = params.model as string | undefined;
    const fields = model ? ENCRYPTED_FIELDS[model] : undefined;

    // 写入时加密（仅对注册了加密字段的模型）
    if (fields && ['create', 'update', 'upsert', 'createMany'].includes(params.action)) {
      const encryptData = (data: Record<string, unknown> | undefined) => {
        if (!data) return;
        for (const field of fields) {
          if (typeof data[field] === 'string' && data[field]) {
            data[field] = encrypt(data[field] as string);
          }
        }
      };

      if (params.action === 'createMany' && params.args.data) {
        if (Array.isArray(params.args.data)) {
          for (const item of params.args.data) {
            encryptData(item);
          }
        }
      } else {
        encryptData(params.args.data);
        if (params.action === 'upsert') {
          encryptData(params.args.create);
          encryptData(params.args.update);
        }
      }
    }

    const result = await next(params);

    // 读取时解密（递归处理所有嵌套的关联对象，无论顶层模型是什么）
    if (result && ['findUnique', 'findFirst', 'findMany', 'create', 'update', 'upsert'].includes(params.action)) {
      const decryptDeep = (obj: unknown) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          for (const item of obj) decryptDeep(item);
          return;
        }
        const record = obj as Record<string, unknown>;
        for (const modelFields of Object.values(ENCRYPTED_FIELDS)) {
          for (const field of modelFields) {
            if (typeof record[field] === 'string' && (record[field] as string).startsWith('enc:')) {
              record[field] = decrypt(record[field] as string);
            }
          }
        }
        for (const val of Object.values(record)) {
          if (val && typeof val === 'object') decryptDeep(val);
        }
      };
      decryptDeep(result);
    }

    return result;
  });

  return client;
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
