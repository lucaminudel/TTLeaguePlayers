import React from 'react';
import { MobileLayout } from '../components/layout/MobileLayout';
import { PageContainer } from '../components/layout/PageContainer';
import { getAppVersion } from '../config/environment';

export const AboutAndContactUs: React.FC = () => {
    const { version, buildDate, buildSeconds } = getAppVersion();

    // Simple anti-scraping: build the email address in JavaScript
    const user = 'contact_us';
    const domain = 'ttleagueplayers.uk';
    const email = `${user}@${domain}`;

    return (
        <MobileLayout>
            <PageContainer title="About & Contact Us">
                <div className="space-y-6">

                    <section className="mt-8">
                        <br/>
                        <h2 className="text-2xl font-bold text-main-text mb-4">Built by Players, for Players</h2>
                        <p className="text-main-text">
                            This <b>Unofficial</b> Web-App 
                            operates independently of any local Table Tennis league organisations.
                            <br/>
                            <br/>
                            <b>Our core values are</b>:<br/>
                            - fair play, positive, inclusive behaviour<br />
                            - a modern digital experience<br />
                            - supporting local clubs &amp; leagues  
                        </p>
                    </section>

                    <section className="mt-8">
                        <br/>
                        <h2 className="text-2xl font-bold text-main-text mb-4">Contact Us</h2>
                        <p className="text-main-text">
                            For technical support, general questions, or media enquiries, email us at:{' '}
                            <a
                                href={`mailto:${email}`}
                                className="text-action-accent hover:underline font-semibold"
                                data-testid="about-email-link"
                            >
                                {email}
                            </a>
                        </p>
                    </section>

                    <section >
                        <p className="text-sm text-main-text/60" data-testid="about-app-version">
                            App. Ver. {version} ({buildSeconds}) — {buildDate}
                        </p>
                    </section>
                </div>
            </PageContainer>
        </MobileLayout>
    );
};
