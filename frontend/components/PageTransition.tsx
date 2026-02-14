"use client"

import { motion } from "framer-motion"

interface PageTransitionProps {
    children: React.ReactNode
    className?: string
}

export default function PageTransition({ children, className }: PageTransitionProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{
                duration: 0.4,
                ease: [0.22, 1, 0.36, 1] // Custom cubic-bezier for "premium" feel
            }}
            className={className}
        >
            {children}
        </motion.div>
    )
}
