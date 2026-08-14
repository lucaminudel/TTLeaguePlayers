import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';
import logo from "../assets/logo.webp";

export const Home: React.FC = () => {
    const { inviteId } = useParams<{ inviteId?: string }>();
    const navigate = useNavigate();
    const { managedClubs } = useAuth();
    const hasInviteId = !!inviteId;

    const handleEnterClick = () => {
        if (hasInviteId) {
            void navigate(`/join/${inviteId}`);
        } else if (managedClubs.length > 0) {
            void navigate(`/promote-my-club`);
        } else {
            void navigate(`/kudos`);
        }
    };

    return (
        <MobileLayout>
            <PageContainer
                title="Welcome"
                footer={
                    <Button
                        fullWidth
                        data-testid="home-enter-button"
                        onClick={handleEnterClick}
                    >
                        {hasInviteId ? 'Redeem your invite' : 'Ready to play?'}
                    </Button>
                }
            >
                <p>
                    <b>Unofficial</b> Table Tennis local leagues' App
                </p>

                <img
                    src={logo}
                    alt="Table Tennis League Players"
                    className="my-8 sm:my-12 h-16 sm:h-20 w-auto block mx-auto"
                />

                <p className="text-base sm:text-lg leading-relaxed">
                    <b>We promote fair play &amp; positive behaviour</b><br />
                     We provide a modern digital experience<br />
                    We support local leagues
                    <br />
                    <br />
                    <b>What Now</b><br />
                    Find local clubs &amp; tournaments<br />
                    Reward fair play &amp; positive behaviour<br />
                    Check your next match date, time, location<br />
                    <br />
                    <b>What's Next</b><br />
                    Manage team formations<br />
                    Record match scorecard in real time<br />
                </p>

            </PageContainer>
        </MobileLayout>
    );
};
