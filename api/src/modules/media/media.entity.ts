import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../user/user.entity';

export type StorageType = 'local' | 'oss';
export type OssPlatform = 'aliyun' | 'tencent' | 'cloudflare' | 'backblaze' | null;

@Entity('media')
export class MediaEntity {
  @PrimaryGeneratedColumn({ comment: '素材 ID' })
  id: number;

  @Column({ type: 'varchar', length: 255, comment: '存储文件名' })
  filename: string;

  @Column({ type: 'varchar', length: 255, name: 'original_name', comment: '原始文件名' })
  originalName: string;

  @Column({ type: 'varchar', length: 100, name: 'mime_type', comment: 'MIME 类型' })
  mimeType: string;

  @Column({ type: 'bigint', comment: '文件大小（字节）' })
  size: number;

  @Column({ type: 'varchar', length: 500, comment: '访问 URL' })
  url: string;

  @Column({
    type: 'enum',
    enum: ['local', 'oss'],
    default: 'local',
    name: 'storage_type',
    comment: '存储类型：local=本地, oss=云存储',
  })
  storageType: StorageType;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'oss_platform',
    comment: 'OSS 平台：aliyun/tencent/cloudflare/backblaze',
  })
  ossPlatform: OssPlatform;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'uploader_id' })
  uploader: UserEntity;

  @Column({ name: 'uploader_id', comment: '上传者 ID' })
  uploaderId: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}
