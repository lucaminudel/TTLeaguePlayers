import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { Button } from '../components/common/Button';
import logo from "../assets/logo.png";   

export const Home: React.FC = () => {
    const { inviteId } = useParams<{ inviteId?: string }>();
    const navigate = useNavigate();
    const hasInviteId = !!inviteId;

    const handleEnterClick = () => {
        if (hasInviteId) {
            void navigate(`/join/${inviteId}`);
        } else {
            console.log('Enter clicked');
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
                    Home of local leagues'
                    Table Tennis players. Starting with the CLTTL<br />                    
                </p>

                <img
                    src={logo}
                    alt="Table Tennis League Players"
                    className="my-8 sm:my-12 h-16 sm:h-20 w-auto block mx-auto"
                />

                <p className="text-base sm:text-lg leading-relaxed">
                    <b>We promote fair play &amp; positive behaviour</b><br />
                    You award Kudos for match fair play <br />
                    We publish the Team Kudos Standings
                    <br />
                    <br />
                    <b>We stay connected</b><br />
                    Never miss a tournament, stay informed on new venues and clubs, discuss gear and more (forums will be added), manage team members availability (feature will be added).<br />
                </p>

            </PageContainer>
        </MobileLayout>
    );
};
