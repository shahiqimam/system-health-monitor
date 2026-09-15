import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Incident } from './incident.entity';
import { User } from './user.entity';

@Entity('incident_notes')
@Index('idx_incident_notes_incident', ['incidentId'])
export class IncidentNote {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'incident_id' })
  incidentId!: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident?: Incident;

  @Column({ type: 'uuid', name: 'author_id', nullable: true })
  authorId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'author_id' })
  author?: User | null;

  @Column({ type: 'varchar', length: 2000 })
  content!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
