import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Driver, Session } from 'neo4j-driver';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vitals } from '../device/entities/vitals.entity';
import { TelemetryData } from '../device/entities/telemetry.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { Medication } from '../profile/entities/medication.entity';
import { Appointment, AppointmentStatus } from '../profile/entities/appointment.entity';

@Injectable()
export class GraphService implements OnModuleInit, OnModuleDestroy {
    constructor(
        @Inject('NEO4J_DRIVER') private readonly driver: Driver,
        @InjectRepository(UserProfile, 'profile')
        private readonly userRepo: Repository<UserProfile>,
        @InjectRepository(Medication, 'profile')
        private readonly medRepo: Repository<Medication>,
        @InjectRepository(Appointment, 'profile')
        private readonly apptRepo: Repository<Appointment>,
        @InjectRepository(Vitals, 'vitals')
        private readonly vitalsRepo: Repository<Vitals>,
        @InjectRepository(TelemetryData, 'vitals')
        private readonly telemetryRepo: Repository<TelemetryData>,
    ) { }

    async onModuleInit() {
        // Neo4j initialization skipped or made non-blocking
        try {
            const session = this.driver.session();
            // await session.run('CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE');
            // await session.run('CREATE CONSTRAINT vital_id IF NOT EXISTS FOR (v:Vital) REQUIRE v.id IS UNIQUE');
            await session.close();
        } catch (error) {
            console.warn('Neo4j is unavailable, Knowledge Graph will use synthetic data.');
        }
    }

    async onModuleDestroy() {
        await this.driver.close();
    }

    async syncGraph(userId: string) {
        const session = this.driver.session();
        try {
            // 1. Fetch Data
            const userProfile = await this.userRepo.findOne({ where: { userId } });
            if (!userProfile) return { success: false, message: 'User not found' };

            const latestBP = await this.vitalsRepo.findOne({
                where: { userId, vitalType: 'blood_pressure' },
                order: { recordedAt: 'DESC' },
            });

            const latestHR = await this.vitalsRepo.findOne({
                where: { userId, vitalType: 'heart_rate' },
                order: { recordedAt: 'DESC' },
            });

            // Get steps (approximate from telemetry or vitals)
            const recentSteps = await this.telemetryRepo.findOne({
                where: { userId, metricType: 'steps' },
                order: { timestamp: 'DESC' },
            });

            // 0. Clean existing graph for user (Projection Reset)
            // This ensures we don't have stale nodes from previous logic
            await session.run(
                `
                MATCH (u:User {id: $userId})-[r]-(n)
                WHERE NOT n:User
                DETACH DELETE n
                `,
                { userId }
            );

            // 2. Sync User
            await session.run(
                `
                MERGE (u:User {id: $userId})
                SET u.name = $name, u.age = $age, u.gender = $gender
                `,
                {
                    userId,
                    name: userProfile.emergencyContactName || 'User', // Fallback
                    age: userProfile.age || 0,
                    gender: userProfile.gender || 'unknown',
                }
            );

            // 3. Sync BP Node
            if (latestBP) {
                const bpLabel = `${latestBP.bloodPressureReading?.systolic}/${latestBP.bloodPressureReading?.diastolic}`;
                await session.run(
                    `
                    MATCH (u:User {id: $userId})
                    MERGE (v:Vital {id: $bpId})
                    SET v.type = 'blood_pressure', v.label = $label, v.value = $label, v.color = '#E91E63', v.timestamp = $timestamp
                    MERGE (u)-[:HAS_VITAL]->(v)
                    `,
                    {
                        userId,
                        bpId: `bp_${userId}`, // Singleton node for dashboard
                        label: bpLabel,
                        timestamp: latestBP.recordedAt.toISOString(),
                    }
                );
            }

            // 4. Sync Steps Node
            if (recentSteps) {
                await session.run(
                    `
                    MATCH (u:User {id: $userId})
                    MERGE (s:Activity {id: $stepId})
                    SET s.type = 'steps', s.label = $steps, s.sublabel = 'Steps', s.color = '#FF9800', s.timestamp = $timestamp
                    MERGE (u)-[:PERFORMED]->(s)
                    `,
                    {
                        userId,
                        stepId: `steps_${userId}`,
                        steps: String(recentSteps.value?.count || recentSteps.value?.steps || '0'),
                        timestamp: recentSteps.timestamp.toISOString(),
                    }
                );
            }

            // 5. Sync Overall Health (Mock calculation)
            const healthScore = (latestBP && latestBP.isWithinNormalRange()) ? 90 : 75;
            await session.run(
                `
                MATCH (u:User {id: $userId})
                MERGE (h:Summary {id: $sumId})
                SET h.label = $score, h.sublabel = 'Overall Health', h.color = '#4CAF50'
                MERGE (u)-[:HAS_SUMMARY]->(h)
                `,
                {
                    userId,
                    sumId: `summary_${userId}`,
                    score: `${healthScore}%`,
                }
            );

            return { success: true };

        } catch (error) {
            console.error('Neo4j sync error:', error);
            // Non-critical error, return success false but don't throw
            return { success: false, message: error.message };
        } finally {
            await session.close();
        }
    }

    private async buildSyntheticGraph(userId: string) {
        const nodes: any[] = [];
        const edges: any[] = [];

        // 1. Central Node
        nodes.push({
            id: 'User',
            label: 'You',
            type: 'main',
            color: '#5a67d8'
        });

        try {
            // 2. Fetch all real data in parallel
            const [userProfile, latestBP, latestHR, latestBS, latestWeight, activeMeds, upcomingAppts] = await Promise.all([
                this.userRepo.findOne({ where: { userId } }),
                this.vitalsRepo.findOne({ where: { userId, vitalType: 'blood_pressure' }, order: { recordedAt: 'DESC' } }),
                this.vitalsRepo.findOne({ where: { userId, vitalType: 'heart_rate' }, order: { recordedAt: 'DESC' } }),
                this.vitalsRepo.findOne({ where: { userId, vitalType: 'blood_sugar' }, order: { recordedAt: 'DESC' } }),
                this.vitalsRepo.findOne({ where: { userId, vitalType: 'weight' }, order: { recordedAt: 'DESC' } }),
                this.medRepo.find({ where: { userProfile: { userId }, isActive: true }, take: 4 }),
                this.apptRepo.find({ where: { userProfile: { userId }, status: AppointmentStatus.SCHEDULED }, order: { scheduledAt: 'ASC' }, take: 3 })
            ]);

            let recentSteps = await this.telemetryRepo.findOne({
                where: { userId, metricType: 'steps' },
                order: { timestamp: 'DESC' },
            });

            if (!recentSteps && userProfile) {
                const latestMetric = await this.userRepo.manager.getRepository('DailyHealthMetric').findOne({
                    where: { userProfileId: userProfile.id },
                    order: { date: 'DESC' }
                }) as any;
                if (latestMetric && latestMetric.steps) {
                    recentSteps = {
                        value: { count: latestMetric.steps },
                        timestamp: latestMetric.date
                    } as any;
                }
            }

            if (userProfile) {
                nodes[0].label = userProfile.emergencyContactName?.split(' ')[0] || 'User';

                // 3. Medical Conditions (Real)
                if (userProfile.medicalConditions && userProfile.medicalConditions.length > 0) {
                    userProfile.medicalConditions.forEach((cond, index) => {
                        if (cond && typeof cond === 'string' && cond.trim().length > 0 && cond !== '{}') {
                            const nodeId = `cond_${index}_${userId}`;
                            nodes.push({
                                id: nodeId,
                                label: cond,
                                sublabel: 'Condition',
                                type: 'condition',
                                color: '#F44336'
                            });
                            edges.push({ from: 'User', to: nodeId, type: 'has' });
                        }
                    });
                }
            }

            // 4. Vitals (Real)
            if (latestBP) {
                const bpLabel = `${latestBP.bloodPressureReading?.systolic}/${latestBP.bloodPressureReading?.diastolic}`;
                const nodeId = `bp_${userId}`;
                nodes.push({
                    id: nodeId,
                    label: bpLabel,
                    sublabel: 'Blood Pressure',
                    type: 'vital',
                    color: '#E91E63',
                    status: latestBP.isWithinNormalRange() ? 'normal' : 'abnormal'
                });
                edges.push({ from: 'User', to: nodeId, type: 'has' });
            }

            if (latestHR) {
                const hrLabel = `${latestHR.heartRate || latestHR.reading?.bpm || '--'} bpm`;
                const nodeId = `hr_${userId}`;
                nodes.push({
                    id: nodeId,
                    label: hrLabel,
                    sublabel: 'Heart Rate',
                    type: 'vital',
                    color: '#FF5252',
                    status: latestHR.isWithinNormalRange() ? 'normal' : 'abnormal'
                });
                edges.push({ from: 'User', to: nodeId, type: 'has' });
            }

            if (latestBS) {
                const bsLabel = `${latestBS.reading?.value || latestBS.reading?.mgdl || '--'} ${latestBS.unit || 'mg/dL'}`;
                const nodeId = `bs_${userId}`;
                nodes.push({
                    id: nodeId,
                    label: bsLabel,
                    sublabel: 'Blood Sugar',
                    type: 'vital',
                    color: '#9C27B0',
                    status: latestBS.isWithinNormalRange() ? 'normal' : 'abnormal'
                });
                edges.push({ from: 'User', to: nodeId, type: 'has' });
            }

            if (latestWeight) {
                const weightValue = latestWeight.reading?.value || latestWeight.reading?.kg || '--';
                const weightLabel = `${weightValue} ${latestWeight.unit || 'kg'}`;
                const nodeId = `weight_${userId}`;
                nodes.push({
                    id: nodeId,
                    label: weightLabel,
                    sublabel: 'Weight',
                    type: 'vital',
                    color: '#795548'
                });
                edges.push({ from: 'User', to: nodeId, type: 'has' });
            }

            // 5. Activity (Real)
            if (recentSteps) {
                const stepsValue = recentSteps.value?.count || recentSteps.value?.steps || '0';
                const nodeId = `steps_${userId}`;
                nodes.push({
                    id: nodeId,
                    label: String(stepsValue),
                    sublabel: 'Steps Today',
                    type: 'exercise',
                    color: '#FF9800'
                });
                edges.push({ from: 'User', to: nodeId, type: 'performed' });
            }

            // 6. Medications (Real)
            if (activeMeds && activeMeds.length > 0) {
                activeMeds.forEach(med => {
                    const nodeId = `med_${med.id}`;
                    nodes.push({
                        id: nodeId,
                        label: med.name,
                        sublabel: med.dosage,
                        type: 'medication',
                        color: '#4CAF50'
                    });
                    edges.push({ from: 'User', to: nodeId, type: 'takes' });
                });
            }

            // 7. Appointments (Real)
            if (upcomingAppts && upcomingAppts.length > 0) {
                upcomingAppts.forEach(appt => {
                    const nodeId = `appt_${appt.id}`;
                    nodes.push({
                        id: nodeId,
                        label: appt.title,
                        sublabel: new Date(appt.scheduledAt).toLocaleDateString([], { month: 'short', day: 'numeric' }),
                        type: 'appointment',
                        color: '#2196F3'
                    });
                    edges.push({ from: 'User', to: nodeId, type: 'attends' });
                });
            }

            // 8. Health Summary Score (Calculated from real metrics)
            let score = 100;
            let checks = 0;
            if (latestBP) { checks++; if (!latestBP.isWithinNormalRange()) score -= 15; }
            if (latestHR) { checks++; if (!latestHR.isWithinNormalRange()) score -= 10; }
            if (latestBS) { checks++; if (!latestBS.isWithinNormalRange()) score -= 15; }

            if (checks > 0) {
                score = Math.max(0, score);
                const sumId = `summary_${userId}`;
                nodes.push({
                    id: sumId,
                    label: `${score}%`,
                    sublabel: 'Health Score',
                    type: 'summary',
                    color: score > 80 ? '#4CAF50' : score > 60 ? '#FFC107' : '#F44336'
                });
                edges.push({ from: 'User', to: sumId, type: 'has' });
            }

        } catch (error) {
            console.error('Error building synthetic graph:', error);
        }

        return { nodes, edges };
    }

    async getUserGraph(userId: string) {
        // Always try to sync if possible
        try {
            const syncResult = await this.syncGraph(userId);
            if (!syncResult.success) {
                console.warn('Neo4j sync failed, falling back to synthetic graph');
                return this.buildSyntheticGraph(userId);
            }
        } catch (error) {
            console.error('Graph sync exception:', error);
            return this.buildSyntheticGraph(userId);
        }

        const session = this.driver.session();
        try {
            const result = await session.run(
                `
                MATCH (u:User {id: $userId})-[r]-(n)
                RETURN u, r, n
                `,
                { userId }
            );

            if (result.records.length === 0) {
                return this.buildSyntheticGraph(userId);
            }

            const nodesMap = new Map();
            const edges: any[] = [];

            // Add Central User Node
            nodesMap.set('User', {
                id: 'User',
                label: 'User',
                type: 'main',
                color: '#5a67d8'
            });

            result.records.forEach(record => {
                const node = record.get('n');
                const relationship = record.get('r');

                const properties = node.properties;
                const labels = node.labels;

                const nodeId = properties.id;

                let type = 'default';
                if (labels.includes('Vital')) type = 'vital';
                if (labels.includes('Activity')) type = 'exercise';
                if (labels.includes('Summary')) type = 'summary';

                nodesMap.set(nodeId, {
                    id: nodeId,
                    label: properties.label || 'Node',
                    sublabel: properties.sublabel || (type === 'vital' ? 'Vital' : ''),
                    type: type,
                    color: properties.color || '#999',
                    status: 'normal'
                });

                edges.push({
                    from: 'User',
                    to: nodeId,
                    type: 'has'
                });
            });

            return {
                nodes: Array.from(nodesMap.values()),
                edges
            };

        } catch (error) {
            console.error('Neo4j query error, falling back to synthetic graph:', error);
            return this.buildSyntheticGraph(userId);
        } finally {
            await session.close();
        }
    }
}
