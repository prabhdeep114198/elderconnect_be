import { Injectable, Inject, Logger } from '@nestjs/common';
import { Driver, Session } from 'neo4j-driver';
import { ProfileService } from '../profile/profile.service';
import { AuthService } from '../auth/auth.service';

export interface GraphNode {
    id: string;
    label: string;
    sublabel?: string;
    type: string;
    color: string;
    status?: string;
}

export interface GraphEdge {
    from: string;
    to: string;
    type: string;
}

@Injectable()
export class GraphService {
    private readonly logger = new Logger(GraphService.name);

    constructor(
        @Inject('NEO4J_DRIVER') private readonly driver: Driver,
        private readonly profileService: ProfileService,
        private readonly authService: AuthService,
    ) { }

    private getSession(): Session {
        return this.driver.session();
    }

    async syncUserData(userId: string) {
        const session = this.getSession();
        try {
            this.logger.log(`Syncing user data to Neo4j for user: ${userId}`);

            const user = await this.authService.validateUserById(userId);
            if (!user) {
                this.logger.warn(`User ${userId} not found during sync`);
                return;
            }

            // Fetch related data, gracefully handling missing components
            let profile: any = null;
            let medications: any[] = [];
            let metrics: any = null;

            try {
                profile = await this.profileService.getProfile(userId);
                medications = await this.profileService.getMedications(userId);
                metrics = await this.profileService.getDailyMetrics(userId);
            } catch (error) {
                this.logger.warn(`Could not fetch full profile data for user ${userId}: ${error.message}`);
            }

            // Create or Update User node
            await session.run(
                `MERGE (u:User {userId: $userId})
                 SET u.name = $name, u.age = $age, u.updatedAt = datetime()`,
                { userId, name: user.fullName || 'User', age: profile?.age || 0 }
            );

            // Sync Interests
            if (profile?.interests && profile.interests.length > 0) {
                for (const interest of profile.interests) {
                    await session.run(
                        `MATCH (u:User {userId: $userId})
                         MERGE (i:Interest {name: $interest})
                         MERGE (u)-[:HAS_INTEREST]->(i)`,
                        { userId, interest }
                    );
                }
            }

            // Sync Conditions
            if (profile?.medicalConditions && profile.medicalConditions.length > 0) {
                for (const condition of profile.medicalConditions) {
                    await session.run(
                        `MATCH (u:User {userId: $userId})
                         MERGE (c:Condition {name: $condition})
                         MERGE (u)-[:HAS_CONDITION]->(c)`,
                        { userId, condition }
                    );
                }
            }

            // Sync Medications
            if (medications && medications.length > 0) {
                for (const med of medications) {
                    await session.run(
                        `MATCH (u:User {userId: $userId})
                         MERGE (m:Medication {id: $medId})
                         SET m.name = $medName, m.dosage = $dosage
                         MERGE (u)-[:TAKES_MEDICATION]->(m)`,
                        { userId, medId: med.id, medName: med.name, dosage: med.dosage }
                    );
                }
            }

            // Sync Metrics (Latest)
            if (metrics) {
                await session.run(
                    `MATCH (u:User {userId: $userId})
                     MERGE (ms:MetricsSummary {userId: $userId})
                     SET ms.steps = $steps, ms.heartRate = $heartRate, ms.sleepHours = $sleepHours, ms.updatedAt = datetime()
                     MERGE (u)-[:HAS_RECENT_METRICS]->(ms)`,
                    {
                        userId,
                        steps: metrics.steps,
                        heartRate: metrics.heartRate,
                        sleepHours: metrics.sleepHours
                    }
                );
            }

            this.logger.log(`Successfully synced user data to Neo4j for user: ${userId}`);
        } catch (error) {
            this.logger.error(`Failed to sync user data to Neo4j: ${error.message}`);
        }
        finally {
            await session.close();
        }
    }

    async getUserGraph(userId: string) {
        const session = this.getSession();
        try {
            // Sync first to ensure data is fresh
            await this.syncUserData(userId);

            const result = await session.run(
                `MATCH (u:User {userId: $userId})
         OPTIONAL MATCH (u)-[r]->(n)
         RETURN u, collect({rel: type(r), node: n}) as connections`,
                { userId }
            );

            if (result.records.length === 0) {
                return { nodes: [], edges: [] };
            }

            const record = result.records[0];
            const userNode = record.get('u');
            const connections = record.get('connections');

            const nodes: GraphNode[] = [
                {
                    id: 'User',
                    label: userNode.properties.name,
                    type: 'main',
                    color: '#5a67d8'
                }
            ];
            const edges: GraphEdge[] = [];

            connections.forEach((conn: any) => {
                if (conn.node) {
                    const nodeType = conn.node.labels[0].toLowerCase();
                    const nodeId = `${nodeType}_${conn.node.identity.toString()}`;

                    let color = '#718096';
                    let label = conn.node.properties.name || conn.node.properties.type || nodeType;
                    let sublabel = nodeType;

                    if (nodeType === 'interest') color = '#448AFF';
                    if (nodeType === 'condition') color = '#FF5252';
                    if (nodeType === 'medication') color = '#9C27B0';
                    if (nodeType === 'metricssummary') {
                        color = '#FF9800';
                        label = `${conn.node.properties.steps} Steps`;
                        sublabel = 'Activity';
                    }

                    nodes.push({
                        id: nodeId,
                        label: label,
                        sublabel: sublabel,
                        type: nodeType,
                        color: color,
                        status: conn.node.properties.status
                    });

                    edges.push({
                        from: 'User',
                        to: nodeId,
                        type: conn.rel
                    });
                }
            });

            return { nodes, edges };
        } catch (error) {
            this.logger.error(`Error fetching user graph: ${error.message}`);
            return { nodes: [], edges: [] };
        } finally {
            await session.close();
        }
    }
}
