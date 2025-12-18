import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';

export const Join: React.FC = () => {
    // inviteId can be used for API call later
    const { inviteId } = useParams<{ inviteId: string }>();

    // Placeholder data
    const data = {
        league: "CLTTL",
        season: "2025-2026",
        division: "Division 4",
        team: "Morpeth 9",
        name: "Gino Gino",
        role: "Team Captain", // Normalized case for display
        email: "alpha@beta.com"
    };

    const title = "Join - Personal Invite";

    useEffect(() => {
        document.title = title;
    }, []);

    return (
        <MobileLayout>
            <PageContainer
                title={title}
                footer={
                    <Button fullWidth onClick={() => { console.log(`Joining with invite ${inviteId ?? ''}`); }}>
                        Register
                    </Button>
                }
            >
                <div className="flex flex-col space-y-4 text-left px-2 max-w-sm mx-auto">
                    <br />
                    <br />
                    <div className="border-b border-gray-600 pb-2 mb-2">
                        <p className="text-secondary-text text-sm uppercase tracking-wide">League/Season</p>
                        <p className="text-xl font-bold">{data.league} {data.season}</p>
                    </div>

                    <div>
                        <p className="text-secondary-text text-sm uppercase tracking-wide">Team</p>
                        <p className="text-lg">{data.team}, {data.division}</p>
                    </div>

                    <div className="pt-4 mt-2 border-t border-gray-600">
                        <p className="text-secondary-text text-sm uppercase tracking-wide">Player</p>
                        <p className="text-lg">{data.name} - {data.role}</p>
                    </div>

                    <div>
                        <p className="text-secondary-text text-sm uppercase tracking-wide">Email ID</p>
                        <p className="text-lg">{data.email}</p>
                    </div>

                </div>
            </PageContainer>
        </MobileLayout>
    );
};
