import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '../../user/entities/user.entity';

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

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'uploader_id' })
  uploader: UserEntity;

  @Column({ name: 'uploader_id', comment: '上传者 ID' })
  uploaderId: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}
