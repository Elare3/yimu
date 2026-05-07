import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import { withAuth } from '@/lib/with-auth';

// 删除旧头像文件：仅限 /uploads/avatars/ 下文件，容错失败
async function removeOldAvatar(avatarUrl: string | null | undefined) {
  if (!avatarUrl) return;
  if (!avatarUrl.startsWith('/uploads/avatars/')) return;
  const filename = path.basename(avatarUrl);
  const filepath = path.join(process.cwd(), 'public', 'uploads', 'avatars', filename);
  try {
    await unlink(filepath);
  } catch {
    // 文件不存在或已删除：忽略
  }
}

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * 通过文件 magic bytes 判断真实图片类型，不信任客户端 Content-Type / 文件名。
 * 返回规范化的扩展名，未识别返回 null。
 */
function detectImageKind(buf: Buffer): 'jpg' | 'png' | 'webp' | 'gif' | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'png';
  // GIF: "GIF87a" or "GIF89a"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  // WebP: "RIFF"...."WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'webp';
  return null;
}

// POST /api/users/avatar — 上传头像
export const POST = withAuth(async (userId, req: Request) => {
  const formData = await req.formData();
  const file = formData.get('avatar') as File | null;

  if (!file) return errorResponse('请选择图片文件');
  if (!ALLOWED_TYPES.includes(file.type)) {
    return errorResponse('仅支持 JPG/PNG/WebP/GIF 格式');
  }
  if (file.size > MAX_SIZE) {
    return errorResponse('图片大小不能超过 2MB');
  }

  // 读入完整内容后按 magic bytes 真实嗅探，忽略客户端 Content-Type
  const buffer = Buffer.from(await file.arrayBuffer());
  const realKind = detectImageKind(buffer);
  if (!realKind) {
    return errorResponse('文件内容不是合法的图片');
  }

  // 生成安全文件名：userId + timestamp + ext（不使用用户提供的文件名）
  const filename = `${userId}_${Date.now()}.${realKind}`;

  // 确保目录存在
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
  await mkdir(uploadDir, { recursive: true });

  // 写入文件
  const filepath = path.join(uploadDir, filename);
  await writeFile(filepath, buffer);

  // 读旧头像，写完新头像后再删除，避免数据库失败时孤立文件
  const prev = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });

  // 更新数据库
  const avatarUrl = `/uploads/avatars/${filename}`;
  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl },
    select: { id: true, avatarUrl: true },
  });

  await removeOldAvatar(prev?.avatarUrl);

  return successResponse(user);
}, '上传头像失败');

// DELETE /api/users/avatar — 删除头像（恢复默认）
export const DELETE = withAuth(async (userId) => {
  const prev = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: '' },
    select: { id: true, avatarUrl: true },
  });

  await removeOldAvatar(prev?.avatarUrl);

  return successResponse(user);
}, '删除头像失败');
