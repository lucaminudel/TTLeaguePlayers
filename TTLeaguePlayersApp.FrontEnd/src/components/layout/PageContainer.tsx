import React, { useEffect } from 'react';

type FormContainerProps = React.FormHTMLAttributes<HTMLFormElement>;

interface PageContainerProps {
    /** The title of the page to be displayed at the top and in the browser tab */
    title: string;
    /** Primary content of the page */
    children?: React.ReactNode;
    /** Footer content, typically a button, which will be pinned to the bottom */
    footer?: React.ReactNode;
    /**
     * Optional form props. When provided, the PageContainer will render a <form>
     * as its root element, allowing native browser form validation and submit semantics
     * while keeping the footer pinned to the bottom.
     */
    formProps?: FormContainerProps;
}

const baseContainerClassName = 'flex-1 flex flex-col w-full text-center mt-2 sm:mt-3';

export const PageContainer: React.FC<PageContainerProps> = ({
    title,
    children,
    footer,
    formProps
}) => {

    useEffect(() => {
        document.title = title;
    }, [title]);

    const containerClassName = [baseContainerClassName, formProps?.className].filter(Boolean).join(' ');

    const content = (
        <>
            {/* Top Section: Title & Content */}
            <div>
                <h2 className="text-3xl sm:text-4xl font-bold mb-3 sm:mb-4">{title}</h2>
                <div className="text-lg sm:text-xl text-secondary-text leading-relaxed px-4">
                    {children}
                </div>
            </div>

            {/* Bottom Section: Footer/Action */}
            {footer && (
                <div className="w-full px-6 sm:px-8 mt-auto pb-4 sm:pb-8">
                    {footer}
                </div>
            )}
        </>
    );

    if (formProps) {
        // Avoid passing a className twice after we merged it into containerClassName
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { className: _ignored, ...restFormProps } = formProps;

        return (
            <form className={containerClassName} {...restFormProps}>
                {content}
            </form>
        );
    }

    return (
        <div className={containerClassName}>
            {content}
        </div>
    );
};
