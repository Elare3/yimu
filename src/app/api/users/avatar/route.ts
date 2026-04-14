import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// POST /api/users/avatar — 上传头像
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();

    const formData = await req.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) return errorResponse('请选择图片文件');
    if (!ALLOWED_TYPES.includes(file.type)) {
      return errorResponse('仅支持 JPG/PNG/WebP/GIF 格式');
    }
    if (file.size > MAX_SIZE) {
      return errorResponse('图片大小不能超过 2MB');
    }

    // 生成安全文件名：userId + timestamp + ext（不使用用户提供的文件名）
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    if (!/^[a-z]+$/.test(ext)) return errorResponse('不支持的图片格式');
    const filename = `${userId}_${Date.now()}.${ext}`;

    // 确保目录存在
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    await mkdir(uploadDir, { recursive: true });

    // 写入文件
    const buffer = Buffer.from(await file.arrayBuffer());
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, buffer);

    // 更新数据库
    const avatarUrl = `/uploads/avatars/${filename}`;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: { id: true, avatarUrl: true },
    });

    return successResponse(user);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('上传头像失败:', e);
    return errorResponse('上传头像失败', 500);
  }
}

// DELETE /api/users/avatar — 删除头像（恢复默认）
export async function DELETE() {
  try {
    const userId = await requireUserId();

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: '' },
      select: { id: true, avatarUrl: true },
    });

    return successResponse(user);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('删除头像失败', 500);
  }
}
