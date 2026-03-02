import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';

export const About: React.FC = () => {
    // Simple anti-scraping: build the email address in JavaScript
    const user = 'contact_us';
    const domain = 'ttleagueplayers.uk';
    const email = `${user}@${domain}`;

    return (
        <MobileLayout>
            <PageContainer title="About">
                <div className="space-y-6">

                    <section className="mt-8">
                        <br/>
                        <h2 className="text-2xl font-bold text-main-text mb-4">Built by Players, for Players</h2>
                        <p className="text-main-text">
                            We are a community of local league players.
                            We operate independently of any local league organisations.
                            <br/>
                            Our core values are:<br/>
                            - a modern digital experience<br/>
                            - transparency and accountability, for all<br/>
                            - a self-organising community with freedom of choice.
                        </p>
                    </section>

                    <section className="mt-8">
                        <h2 className="text-2xl font-bold text-main-text mb-4">Contacts</h2>
                        <p className="text-main-text">
                            For technical support, questions, etc. email us at{' '}
                            <a
                                href={`mailto:${email}`}
                                className="text-action-accent hover:underline font-semibold"
                                data-testid="about-email-link"
                            >
                                {email}
                            </a>
                        </p>
                    </section>
                </div>
            </PageContainer>
        </MobileLayout>
    );
};
