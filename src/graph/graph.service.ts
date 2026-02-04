import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Driver, Session } from 'neo4j-driver';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vitals } from '../device/entities/vitals.entity';
import { TelemetryData } from '../device/entities/telemetry.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';

@Injectable()
export class GraphService implements OnModuleInit, OnModuleDestroy {
    constructor(
        @Inject('NEO4J_DRIVER') private readonly driver: Driver,
        @InjectRepository(UserProfile, 'profile')
        private readonly userRepo: Repository<UserProfile>,
        @InjectRepository(Vitals, 'vitals')
        private readonly vitalsRepo: Repository<Vitals>,
        @InjectRepository(TelemetryData, 'vitals')
        private readonly telemetryRepo: Repository<TelemetryData>,
    ) { }

    async onModuleInit() {
        const session = this.driver.session();
        try {
            await session.run('CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE');
            await session.run('CREATE CONSTRAINT vital_id IF NOT EXISTS FOR (v:Vital) REQUIRE v.id IS UNIQUE');
        } catch (error) {
            console.error('Neo4j init error:', error);
        } finally {
            await session.close();
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
            throw error;
        } finally {
            await session.close();
        }
    }

    async getUserGraph(userId: string) {
        // Ensure data is synced first
        await this.syncGraph(userId);

        const session = this.driver.session();
        try {
            const result = await session.run(
                `
                MATCH (u:User {id: $userId})-[r]-(n)
                RETURN u, r, n
                `,
                { userId }
            );

            const nodesMap = new Map();
            const edges: any[] = [];

            // Add Central User Node
            // We want specific ID 'User' for frontend compatibility if possible, or mapping
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

                // Map Neo4j node to Frontend Node
                const nodeId = properties.id;

                // Determine type/color
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

        } finally {
            await session.close();
        }
    }
}
